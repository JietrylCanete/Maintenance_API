const db = require('_helpers/db');
const Role = require('_helpers/role');
const { Op } = require('sequelize');

module.exports = {
    log,
    logMany,
    clientInfo,
    getLogs
};

// Entries written by the system itself, not by a person
const SYSTEM_ACTIONS = ['request_classified', 'request_auto_assigned'];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Writing logs
// ---------------------------------------------------------------------------

// IP address + browser of the person making the request
function clientInfo(req) {
    return {
        ipAddress: req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'Unknown IP',
        browserInfo: req.headers['user-agent'] || 'Unknown Browser'
    };
}

// Save one entry in the background. Never awaited, never throws:
// a logging problem can not slow down or break the real request.
function log(entry) {
    logMany([entry]);
}

// Save several entries with ONE insert (keeps their order) in the background.
function logMany(entries) {
    try {
        const rows = entries.map(toRow);
        db.ActivityLog.bulkCreate(rows)
            .catch(err => console.error('Activity log failed:', err.message));
    } catch (err) {
        console.error('Activity log failed:', err.message);
    }
}

function toRow(entry) {
    return {
        AccountId: entry.actorId,
        actionType: entry.actionType,
        actionDetails: entry.details || null,
        ipAddress: cut(entry.ipAddress, 64),
        browserInfo: cut(entry.browserInfo, 255),
        requestId: entry.requestId || null,
        ownerId: entry.ownerId || null,
        assigneeId: entry.assigneeId || null,
        previousAssigneeId: entry.previousAssigneeId || null,
        timestamp: new Date()
    };
}

function cut(value, max) {
    if (value === undefined || value === null) return null;
    return String(value).slice(0, max);
}

// ---------------------------------------------------------------------------
// Reading logs
// ---------------------------------------------------------------------------

// Everything that involves one person: things they did, things done on
// requests they submitted, requests assigned to them, requests taken from them.
function involving(accountId) {
    return {
        [Op.or]: [
            { AccountId: accountId },
            { ownerId: accountId },
            { assigneeId: accountId },
            { previousAssigneeId: accountId }
        ]
    };
}

async function getLogs(user, filters = {}) {
    const isAdmin = user.role === Role.Admin;
    const conditions = [];

    if (!isAdmin) {
        // Staff and User: only what involves them. This is enforced here,
        // whatever the browser sends.
        conditions.push(involving(user.AccountId));
    } else {
        const userId = toInt(filters.userId);
        if (userId) conditions.push(involving(userId));
    }

    if (typeof filters.actionType === 'string' && filters.actionType) {
        // An explicit choice (even "Login") always wins
        conditions.push({ actionType: filters.actionType });
    } else if (filters.includeLogins !== 'true') {
        // By default logins are hidden so important events are not buried.
        // They are still stored and can be shown with "Include logins".
        conditions.push({ actionType: { [Op.ne]: 'login' } });
    }

    const start = parseDay(filters.startDate, false);
    const end = parseDay(filters.endDate, true);
    if (start && end) conditions.push({ timestamp: { [Op.between]: [start, end] } });
    else if (start) conditions.push({ timestamp: { [Op.gte]: start } });
    else if (end) conditions.push({ timestamp: { [Op.lte]: end } });

    const where = conditions.length ? { [Op.and]: conditions } : {};

    const pageSize = Math.min(toInt(filters.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(toInt(filters.page) || 1, 1);

    // Only one page of rows is ever loaded, however large the table becomes
    const [total, rows] = await Promise.all([
        db.ActivityLog.count({ where }),
        db.ActivityLog.findAll({
            where,
            include: [{
                model: db.Account,
                attributes: ['firstName', 'lastName', 'role', 'email'],
                required: false
            }],
            order: [['timestamp', 'DESC'], ['activityLogId', 'DESC']],
            limit: pageSize,
            offset: (page - 1) * pageSize
        })
    ]);

    return {
        data: rows.map(row => format(row, user, isAdmin)),
        total,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1)
    };
}

function format(row, user, isAdmin) {
    const isSystem = SYSTEM_ACTIONS.includes(row.actionType);
    const actor = row.Account;
    const byMe = !isSystem && row.AccountId === user.AccountId;

    return {
        activityLogId: row.activityLogId,
        actionType: row.actionType,
        actionDetails: row.actionDetails,
        timestamp: row.timestamp,
        requestId: row.requestId,
        actorName: isSystem ? 'System' : (actor ? `${actor.firstName} ${actor.lastName}` : 'Deleted account'),
        actorRole: isSystem ? 'System' : (actor ? actor.role : null),
        byMe,
        // Contact and device details are for Admin only (shown as a hover tooltip)
        actorEmail: isAdmin && actor && !isSystem ? actor.email : null,
        ipAddress: isAdmin && !isSystem ? row.ipAddress : null,
        browserInfo: isAdmin && !isSystem ? row.browserInfo : null
    };
}

// "2026-11-14" -> start of that day, or end of that day when endOfDay is true
function parseDay(value, endOfDay) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
    return isNaN(date.getTime()) ? null : date;
}

function toInt(value) {
    const number = parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : null;
}