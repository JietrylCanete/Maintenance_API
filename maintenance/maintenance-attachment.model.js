const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        AttachmentId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        RequestId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        fileName: {
            type: DataTypes.STRING,
            allowNull: false
        },

        filePath: {
            type: DataTypes.STRING,
            allowNull: false
        },

        fileType: {
            type: DataTypes.STRING,
            allowNull: false
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('MaintenanceAttachment', attributes, options);
}