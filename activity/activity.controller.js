const express = require('express');
const router = express.Router();
const authorize = require('_middleware/authorize');
const activityService = require('./activity.service');

module.exports = router;

// Admin: every log. Staff and User: only logs that involve them.
router.get('/', authorize(), getLogs);

function getLogs(req, res, next) {
    activityService.getLogs(req.user, {
        actionType: req.query.actionType,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        userId: req.query.userId,
        includeLogins: req.query.includeLogins,
        page: req.query.page,
        pageSize: req.query.pageSize
    })
        .then(result => res.json(result))
        .catch(next);
}