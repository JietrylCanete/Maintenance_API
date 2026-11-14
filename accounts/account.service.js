const config = require('config.json'); 
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcryptjs'); 
const crypto= require("crypto"); 
const { Op} = require('sequelize');
const sendEmail = require('_helpers/send-email'); 
const db = require('_helpers/db');
const Role = require('_helpers/role');
const activityService = require('../activity/activity.service');

module.exports = { 
    authenticate,
    refreshToken,
    revokeToken,
    register,
    verifyEmail,
    forgotPassword,
    validateResetToken,
    resetPassword, 
    getAll,
    getById,
    create,
    logActivity,
    update,
    updatePreferences,
    getPreferences,
    delete: _delete
};

async function authenticate({ email, password, ipAddress, browserInfo }) {
    const account = await db.Account.scope('withHash').findOne({ where: { email } });
  
    if (!account || !account.isVerified || !(await bcrypt.compare(password, account.passwordHash))) {
      throw 'Email or password is incorrect';
    }
  
    const jwtToken = generateJwtToken(account);
    const refreshToken = generateRefreshToken(account, ipAddress);
  
    await refreshToken.save();
  
    try {
      await logActivity(account.AccountId, 'login', ipAddress, browserInfo, 'Signed in');
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  
    return {
      ...basicDetails(account),
      jwtToken,
      refreshToken: refreshToken.token
    };
  }
// Writes one activity log entry in the background (never slows or breaks the caller).
// Logs are kept forever. Reading them is done in activity/activity.service.js
function logActivity(AccountId, actionType, ipAddress, browserInfo, updateDetails = '') {
    activityService.log({
        actorId: AccountId,
        actionType,
        details: updateDetails,
        ipAddress,
        browserInfo
    });
}
async function refreshToken({ token, ipAddress }) { 
    const refreshToken = await getRefreshToken(token); 
    const account = await refreshToken.getAccount();

    const newRefreshToken = generateRefreshToken (account, ipAddress); 
    refreshToken.revoked = Date.now();
    refreshToken.revokedByIp = ipAddress;
    refreshToken.replacedByToken = newRefreshToken.token;
    await refreshToken.save();
    await newRefreshToken.save();
    
    const jwtToken = generateJwtToken(account);
    
    return {
        ...basicDetails (account),
        jwtToken,
        refreshToken: newRefreshToken.token
    };
}
async function revokeToken({ token, ipAddress }) { 
    const refreshToken = await getRefreshToken (token);
    
    refreshToken.revoked = Date.now();
    refreshToken.revokedByIp = ipAddress; 
    await refreshToken.save();
}
async function register(params, origin) {
    if (await db.Account.findOne({ where: { email: params.email } })) {
        return await sendAlreadyRegisteredEmail (params.email, origin);
    }
    
    const account = new db.Account (params);

    const isFirstAccount = (await db.Account.count()) === 0; 
    account.role = isFirstAccount? Role.Admin: Role.User; 
    account.verificationToken = randomTokenString();
    
    account.passwordHash = await hash (params.password);
    
    await account.save();
      
    const preferencesData = {
      AccountId: account.AccountId, // Reference to the newly created user's ID
      theme: 'light',  // Default theme (you can modify these defaults as needed)
      notifications: true,  // Default notifications preference
      language: 'en'   // Default language
    };
    
    // Save the preferences for the user
    await db.Preferences.create(preferencesData);
    await sendVerificationEmail (account, origin);
}
async function verifyEmail({token}) {
    const account = await db.Account.findOne({ where: { verificationToken: token} });

    if (!account) throw 'Verification failed';

    account.verified = Date.now();
    account.verificationToken = null; 
    await account.save();
}
async function forgotPassword({ email }, origin) {
    const account = await db.Account.findOne({ where: { email } });

    if (!account) return;
    
    account.resetToken = randomTokenString();
    account.resetTokenExpires= new Date(Date.now() + 24*60*60*1000);
    await account.save();

    await sendPasswordResetEmail (account, origin);
}
async function validateResetToken({token}) { 
    const account = await db.Account.findOne({ 
        where: {
            resetToken: token,
            resetTokenExpires: { [Op.gt]: Date.now() }
        }
    });

    if (!account) throw 'Invalid token';

    return account;
}
async function resetPassword({ token, password }, ipAddress, browserInfo) {
    const account = await validateResetToken({ token });
  
     // Add password validation if needed
     if (password.length < 6) {
      throw 'Password must be at least 6 characters';
  }
    account.passwordHash = await hash(password);
    account.passwordReset = Date.now();
    account.resetToken = null;
    account.resetTokenExpires = null; // Clear the expiry
    await account.save();
  
    try {
      await logActivity(account.AccountId, 'password_reset', ipAddress, browserInfo);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  
    return;
  }

async function getAll() {
    const accounts = await db.Account.findAll(); 
    return accounts.map(x => basicDetails(x));
}

async function getById(AccountId) {
    const account = await getAccount(AccountId); 
    return basicDetails (account);
}
async function create(params) {
  // Check if the email is already registered
  const existingAccount = await db.Account.findOne({ where: { email: params.email } });
  if (existingAccount) {
      throw `Email "${params.email}" is already registered`;
  }

  const account = new db.Account(params);
  account.verified = Date.now();
  account.passwordHash = await hash(params.password);

  // Save the account
  await account.save();

  // Create default preferences for the new user
  await db.Preferences.create({
      AccountId: account.AccountId,
      theme: 'light',
      notifications: true,
      language: 'en'
  });

  // Return the basic details of the created account
  return basicDetails(account);
}
async function update(AccountId, params, ipAddress, browserInfo) {
  const account = await getAccount(AccountId);
  const oldData = account.toJSON(); // Get current user data as a plain object
  const updatedFields = []; // Declare updatedFields array
  const nonUserFields = ['ipAddress', 'browserInfo'];

  // Fields that really changed (lists such as capabilities are compared by content)
  const changedKeys = Object.keys(params).filter(key =>
    !nonUserFields.includes(key) &&
    params[key] !== undefined &&
    !sameValue(oldData[key], params[key])
  );

  // Check if any meaningful changes are being made
  const hasChanges = changedKeys.length > 0;

  if (!hasChanges) {
    return basicDetails(account);
  }

  if (params.email && account.email !== params.email && await db.Account.findOne({ where: { email: params.email } })) { 
      throw 'Email "' + params.email + '" is already taken';
  }

  if (params.password) {
      params.passwordHash = await hash(params.password);
  }

  // Never store passwords or hashes in the activity log
  const hiddenFields = ['confirmPassword', 'passwordHash'];

  for (const key of changedKeys) {
    if (hiddenFields.includes(key)) continue;

    if (key === 'password') {
        updatedFields.push('password');
    } else {
        updatedFields.push(`${fieldLabel(key)}: ${readableValue(oldData[key])} -> ${readableValue(params[key])}`);
    }
  }

  Object.assign(account, params); 
  account.updated = Date.now(); 

  try {
      await account.save();

      // Log activity with updated fields
      const updateDetails = updatedFields.length > 0 
          ? `Changed ${updatedFields.join('; ')}` 
          : 'No fields changed';

      await logActivity(account.AccountId, 'profile update', ipAddress || 'Unknown IP', browserInfo || 'Unknown Browser', updateDetails);
  } catch (error) {
      console.error('Error logging activity:', error);
  }

  return basicDetails(account);
}
async function _delete(AccountId) {
    const account = await getAccount(AccountId);
    await account.destroy();
}
// Helpers for the profile update log: compare values and write them in plain words
function sameValue(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
        const left = (Array.isArray(a) ? a : []).map(String).sort();
        const right = (Array.isArray(b) ? b : []).map(String).sort();
        return left.length === right.length && left.every((value, i) => value === right[i]);
    }
    return a === b;
}
function readableValue(value) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
    if (value === null || value === undefined || value === '') return 'empty';
    return String(value);
}
function fieldLabel(key) {
    const labels = {
        title: 'title',
        firstName: 'first name',
        lastName: 'last name',
        email: 'email',
        phoneNumber: 'phone number',
        role: 'role',
        capabilities: 'capabilities'
    };
    return labels[key] || key;
}
//===================Preferences Get & Update Function===========================
async function getPreferences(AccountId) {
  const preferences = await db.Preferences.findOne({
      where: { AccountId: AccountId },
      attributes: ['preferenceId', 'userId','theme', 'notifications', 'language']
  });
  if (!preferences) throw new Error('User not found');
  return preferences;
}
async function updatePreferences(AccountId, params) {
  const preferences = await db.Preferences.findOne({ where: { AccountId } });
  if (!preferences) throw new Error('User not found');

  // Update only the provided fields
  Object.assign(preferences, params);

  await preferences.save();
}
async function getAccount (AccountId) {
    const account = await db.Account.findByPk(AccountId); 
    if (!account) throw 'Account not found';
    return account;
}
async function getRefreshToken(token) {
    const refreshToken = await db.RefreshToken.findOne({ where: {token} });
    if (!refreshToken || !refreshToken.isActive) throw 'Invalid token'; 
    return refreshToken;
}
async function hash (password) {
    return await bcrypt.hash (password, 10);
}
function generateJwtToken(account) {
    return jwt.sign({ sub: account.AccountId, AccountId: account.AccountId}, config.secret, { expiresIn: '1h' });
}
function generateRefreshToken(account, ipAddress) {
    return new db.RefreshToken({
        AccountId: account.AccountId, // Set the AccountId field
        token: randomTokenString(),
        expires: new Date(Date.now() + 7*24*60*60*1000), 
        createdByIp: ipAddress
    });
}
function randomTokenString() {
    return crypto.randomBytes (40).toString('hex');
}
function basicDetails(account) {
    const {
        AccountId,
        title,
        firstName,
        lastName,
        email,
        phoneNumber,
        role,
        capabilities,
        created,
        updated,
        isVerified
    } = account;

    return {
        AccountId,
        title,
        firstName,
        lastName,
        email,
        phoneNumber,
        role,
        capabilities: capabilities || [],
        created,
        updated,
        isVerified
    };
}
async function sendVerificationEmail(account, origin) {
    let message;
    if (origin) {
        const verifyUrl = `${origin}/account/verify-email?token=${account.verificationToken}`; 
        message = `<p>Please click the below link to verify your email address:</p>;
                   <p><a href="${verifyUrl}">${verifyUrl}</a></p>`;
    } else {
        message = `<p>Please use the below token to verify your email address with the <code>/account/verify-email</code> api route:</p> 
                   <p><code>${account.verificationToken}</code></p>`;
    }
    
    await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification API - Verify Email',
    html: `<h4>Verify Email</h4>
          <p>Thanks for registering!</p> 
          ${message}`
    });
}
async function sendAlreadyRegisteredEmail(email, origin) {
    let message; 
    if (origin) {
        message = `
        <p>If you don't know your password please visit the <a href="${origin}/account/forgot-password">forgot password</a> page.</p>`; 
    } else { message = `
        <p>If you don't know your password you can reset it via the <code>/account/forgot-password</code> api route.</p>`;
    }

    await sendEmail({
        to: email,
        subject: 'Sign-up Verification API - Email Already Registered',
        html: `<h4>Email Already Registered</h4>
        <p>Your email <strong>${email}</strong> is already registered.</p> ${message}`
    });
}
async function sendPasswordResetEmail (account, origin) {
    let message;
    if (origin) {
        const resetUrl = `${origin}/account/reset-password?token=${account.resetToken}`;
        message = `<p>Please click the below link to reset your password, the link will be valid for 1 day:</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>`;
    } else {
        message = `<p>Please use the below token to reset your password with the <code>/account/reset-password</code> api route:</p> 
                   <p><code>${account.resetToken}</code></p>`;
    }
    
    await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification API - Reset Password',
    html: `<h4>Reset Password Email</h4>
          ${message}`
    });
}