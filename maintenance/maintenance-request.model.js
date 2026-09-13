const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        RequestId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        AccountId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        title: {
            type: DataTypes.STRING,
            allowNull: false
        },

        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },

        location: {
            type: DataTypes.STRING,
            allowNull: false
        },

        category: {
            type: DataTypes.STRING,
            allowNull: true
        },

        priority: {
            type: DataTypes.STRING,
            allowNull: true
        },

        aiReason: {
            type: DataTypes.TEXT,
            allowNull: true
        },

        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'Pending'
        },

        assignedTo: {
            type: DataTypes.INTEGER,
            allowNull: true
        },

        resolvedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },

        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('MaintenanceRequest', attributes, options);
}