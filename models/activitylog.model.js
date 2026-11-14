const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        activityLogId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

        // Who performed the action
        AccountId: { type: DataTypes.INTEGER, allowNull: false },

        actionType: { type: DataTypes.STRING, allowNull: false },
        actionDetails: { type: DataTypes.TEXT, allowNull: true },
        ipAddress: { type: DataTypes.STRING(64), allowNull: true },
        browserInfo: { type: DataTypes.STRING(255), allowNull: true },

        // Maintenance request this entry is about (null for account events such as login)
        requestId: { type: DataTypes.INTEGER, allowNull: true },

        // People affected by the entry, so each of them can see it (Reading B).
        // These are plain numbers (no foreign keys) so logs are never blocked
        // or removed when an account is deleted.
        ownerId: { type: DataTypes.INTEGER, allowNull: true },            // who submitted the request
        assigneeId: { type: DataTypes.INTEGER, allowNull: true },         // staff assigned at that moment
        previousAssigneeId: { type: DataTypes.INTEGER, allowNull: true }, // staff it was taken away from

        timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    };

    const options = {
        timestamps: false,
        // Indexes keep the log fast no matter how many rows it holds.
        indexes: [
            { name: 'idx_activity_actor_time', fields: ['AccountId', 'timestamp'] },
            { name: 'idx_activity_owner_time', fields: ['ownerId', 'timestamp'] },
            { name: 'idx_activity_assignee_time', fields: ['assigneeId', 'timestamp'] },
            { name: 'idx_activity_prev_assignee', fields: ['previousAssigneeId'] },
            { name: 'idx_activity_type_time', fields: ['actionType', 'timestamp'] },
            { name: 'idx_activity_time', fields: ['timestamp'] },
            { name: 'idx_activity_request', fields: ['requestId'] }
        ]
    };

    return sequelize.define('ActivityLog', attributes, options);
}