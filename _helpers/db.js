    const config = require('config.json');
    const mysql = require('mysql2/promise');
    const { Sequelize } = require('sequelize');

    module.exports = db = {};

    initialize();
    async function initialize() { 
        const { host, port, user, password, database } = config.database;
        const connection = await mysql.createConnection({ host, port, user, password });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
        
        await connection.end();

        const sequelize = new Sequelize(database, user, password, { host: 'localhost', dialect: 'mysql' });

    // Initialize models and add them to the exported `db` object

    db.Account = require('../accounts/account.model')(sequelize);
    db.RefreshToken = require('../accounts/refresh-token.model')(sequelize);
    db.Preferences = require('../models/preferences.model')(sequelize);
    db.ActivityLog = require('../models/activitylog.model')(sequelize);
    db.MaintenanceRequest = require('../maintenance/maintenance-request.model')(sequelize);
    db.MaintenanceAttachment = require('../maintenance/maintenance-attachment.model')(sequelize);   

    db.Account.hasMany(db.RefreshToken, { foreignKey: 'AccountId', onDelete: 'CASCADE' });
    db.RefreshToken.belongsTo(db.Account, { foreignKey: 'AccountId' });

    db.ActivityLog.belongsTo(db.Account, { foreignKey: 'AccountId' });
    db.Preferences.belongsTo(db.Account, { foreignKey: 'AccountId' });
    
    db.Account.hasMany(db.MaintenanceRequest, { foreignKey: 'AccountId' });
    db.MaintenanceRequest.belongsTo(db.Account, { foreignKey: 'AccountId' });

    db.MaintenanceRequest.hasMany(db.MaintenanceAttachment, { foreignKey: 'RequestId', onDelete: 'CASCADE' });
    db.MaintenanceAttachment.belongsTo(db.MaintenanceRequest, { foreignKey: 'RequestId' });

    await sequelize.sync({ alter: true });
}
