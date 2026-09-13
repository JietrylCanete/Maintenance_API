const express = require('express');
const router = express.Router();
const db = require('_helpers/db');
const authorize = require('_middleware/authorize');
const upload = require('../uploads/maintenance-images/upload.middleware');
const aiService = require('../services/ai.service');
const { Op } = require('sequelize');

module.exports = router;

// Create maintenance request
router.post('/', authorize(), create);

// Get all maintenance requests
router.get('/', authorize(), getAll);

// Get maintenance requests assigned to the logged-in staff
router.get('/assigned', authorize(), getAssigned);

// Get maintenance request by ID
router.get('/:id', authorize(), getById);

// Update maintenance request status
router.patch('/:id/status', authorize(), updateStatus);
router.patch('/:id/assign', authorize(), assignRequest);

// Upload attachment for a maintenance request
router.post('/:id/attachments', authorize(), upload.single('image'), uploadAttachment);
router.get('/:id/attachments', authorize(), getAttachments);



async function getAssigned(req, res, next) {
    try {
        const requests = await db.MaintenanceRequest.findAll({
            where: {
                assignedTo: req.user.AccountId
            },
            order: [['createdAt', 'DESC']]
        });

        res.json(requests);
    } catch (error) {
        next(error);
    }
}

async function assignRequest(req, res, next) {
    try {
        const request = await db.MaintenanceRequest.findByPk(req.params.id);

        if (!request) {
            return res.status(404).json({
                message: 'Maintenance request not found.'
            });
        }

        if (!req.body.assignedTo) {
            return res.status(400).json({
                message: 'assignedTo is required.'
            });
        }

        const staff = await db.Account.findByPk(req.body.assignedTo);

        if (!staff) {
            return res.status(404).json({
                message: 'Staff account not found.'
            });
        }

        if (staff.role !== 'Staff') {
            return res.status(400).json({
                message: 'The selected account is not a Staff account.'
            });
        }

        request.assignedTo = staff.AccountId;

        await request.save();

        res.json({
            success: true,
            message: 'Maintenance request assigned successfully.',
            request
        });
    } catch (error) {
        next(error);
    }
}

async function updateStatus(req, res, next) {
    try {
        const request = await db.MaintenanceRequest.findByPk(req.params.id);

        if (!request) {
            return res.status(404).json({
                message: 'Maintenance request not found.'
            });
        }

        const validStatuses = [
            'Pending',
            'In Progress',
            'Resolved',
            'Cancelled'
        ];

        if (!validStatuses.includes(req.body.status)) {
            return res.status(400).json({
                message: 'Invalid maintenance request status.'
            });
        }

        request.status = req.body.status;

        await request.save();

        res.json(request);
    } catch (error) {
        next(error);
    }
}

async function autoAssignMaintenance(category) {
    if (!category || category === 'Other') {
        return null;
    }

    const staffAccounts = await db.Account.findAll({
        where: {
            role: 'Staff'
        }
        
    });

    const capableStaff = staffAccounts.filter(staff => {
        const capabilities = Array.isArray(staff.capabilities)
            ? staff.capabilities
            : [];

        return capabilities.includes(category);
    });

    if (capableStaff.length === 0) {
        return null;
    }

    let selectedStaff = null;
    let lowestWorkload = Infinity;

    for (const staff of capableStaff) {

        const activeRequests = await db.MaintenanceRequest.count({
            where: {
                assignedTo: staff.AccountId,
                status: {
                    [Op.in]: ['Pending', 'In Progress']
                }
            }
        });

        if (activeRequests < lowestWorkload) {
            lowestWorkload = activeRequests;
            selectedStaff = staff;
        }
    }

    return selectedStaff ? selectedStaff.AccountId : null;
}

async function create(req, res, next) {
    try {

    
        const aiResult = await aiService.classifyMaintenance(
            req.body.title,
            req.body.description,
            req.body.location
        );

        const assignedTo = await autoAssignMaintenance(
            aiResult.category
        );

        const request = await db.MaintenanceRequest.create({
            AccountId: req.user.AccountId,
            title: req.body.title,
            description: req.body.description,
            location: req.body.location,

            category: aiResult.category,
            priority: aiResult.priority,
            aiReason: aiResult.reason,
            assignedTo: assignedTo
        });

        res.json({
            success: true,
            message: 'Maintenance request created successfully',
            request
        });
    } catch (error) {
        next(error);
    }
}


async function getAll(req, res, next) {
    try {
        const requests = await db.MaintenanceRequest.findAll({
            order: [['createdAt', 'DESC']]
        });

        res.json(requests);
    } catch (error) {
        next(error);
    }
}


async function getById(req, res, next) {
    try {
        const request = await db.MaintenanceRequest.findByPk(req.params.id);

        if (!request) {
            return res.status(404).json({
                message: 'Maintenance request not found'
            });
        }

        res.json(request);
    } catch (error) {
        next(error);
    }
}


async function uploadAttachment(req, res, next) {
    try {
        const request = await db.MaintenanceRequest.findByPk(req.params.id);

        if (!request) {
            return res.status(404).json({
                message: 'Maintenance request not found'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                message: 'Image is required'
            });
        }

        const attachment = await db.MaintenanceAttachment.create({
            RequestId: request.RequestId,
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileType: req.file.mimetype
        });

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            attachment
        });
    } catch (error) {
        next(error);
    }
}


async function getAttachments(req, res, next) {
    try {
        const request = await db.MaintenanceRequest.findByPk(req.params.id);

        if (!request) {
            return res.status(404).json({
                message: 'Maintenance request not found'
            });
        }

        const attachments = await db.MaintenanceAttachment.findAll({
            where: {
                RequestId: req.params.id
            },
            order: [['createdAt', 'DESC']]
        });

        res.json(attachments);
    } catch (error) {
        next(error);
    }
}