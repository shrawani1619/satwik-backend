import RelationshipManager from '../models/relationship.model.js';
import User from '../models/user.model.js';
import Franchise from '../models/franchise.model.js';
import Lead from '../models/lead.model.js';
import Invoice from '../models/invoice.model.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import auditService from '../services/audit.service.js';
import { getPaginationMeta } from '../utils/helpers.js';

/**
 * Create Relationship Manager (and RM User for login)
 */
export const createRelationshipManager = async (req, res, next) => {
  try {
    const { name, ownerName, email, mobile, password, address, status, regionalManager } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Relationship manager name is required',
      });
    }
    if (!ownerName?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Owner name is required',
      });
    }
    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Owner email is required for login',
      });
    }
    if (!mobile?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Owner mobile is required',
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password is required and must be at least 6 characters',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { mobile: mobile.trim() }],
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email or mobile already exists',
      });
    }

    let allowedRegionalManager = regionalManager;
    if (regionalManager && req.user.role !== 'super_admin') {
      allowedRegionalManager = undefined;
    }
    if (allowedRegionalManager) {
      const rm = await User.findById(allowedRegionalManager);
      if (!rm || rm.role !== 'regional_manager') {
        return res.status(400).json({
          success: false,
          message: 'Invalid regional manager. Select a user with regional_manager role.',
        });
      }
    }
    const rmPayload = {
      name: name.trim(),
      ownerName: ownerName.trim(),
      email: email.toLowerCase().trim(),
      mobile: mobile.trim(),
      status: status || 'active',
      address: address || {},
      ...(allowedRegionalManager && { regionalManager: allowedRegionalManager }),
    };
    if (req.user.role === 'regional_manager') {
      rmPayload.regionalManager = req.user._id;
    }
    const relationshipManager = await RelationshipManager.create(rmPayload);

    const hashedPassword = await bcrypt.hash(password, 10);
    const ownerUser = await User.create({
      name: ownerName.trim(),
      email: relationshipManager.email,
      mobile: relationshipManager.mobile,
      password: hashedPassword,
      role: 'relationship_manager',
      relationshipManagerOwned: relationshipManager._id,
      status: 'active',
    });

    relationshipManager.owner = ownerUser._id;
    await relationshipManager.save();

    const populatedRM = await RelationshipManager.findById(relationshipManager._id)
      .populate('owner', 'name email')
      .populate('regionalManager', 'name email');

    res.status(201).json({
      success: true,
      message: 'Relationship manager created successfully',
      data: populatedRM,
    });
  } catch (error) {
    console.error('Error creating relationship manager:', error);
    next(error);
  }
};

/**
 * Get All Relationship Managers
 */
export const getRelationshipManagers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (req.user.role === 'accounts_manager') {
      // Accountant can only see relationship managers under assigned Regional Managers
      const { getAccountantAccessibleRelationshipManagerIds } = await import('../utils/accountantScope.js');
      const accessibleRMIds = await getAccountantAccessibleRelationshipManagerIds(req);
      if (accessibleRMIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: getPaginationMeta(page, limit, 0),
        });
      }
      query.owner = { $in: accessibleRMIds };
    } else if (req.user.role === 'regional_manager') {
      query.regionalManager = req.user._id;
    }

    const relationshipManagers = await RelationshipManager.find(query)
      .populate('owner', 'name email')
      .populate('regionalManager', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await RelationshipManager.countDocuments(query);
    const pagination = getPaginationMeta(page, limit, total);

    res.status(200).json({
      success: true,
      data: relationshipManagers,
      pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Relationship Manager By ID
 */
export const getRelationshipManagerById = async (req, res, next) => {
  try {
    const relationshipManager = await RelationshipManager.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('regionalManager', 'name email');

    if (!relationshipManager) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }
    if (req.user.role === 'regional_manager') {
      if (relationshipManager.regionalManager?.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: relationshipManager,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Relationship Manager
 */
export const updateRelationshipManager = async (req, res, next) => {
  try {
    // Check if relationship manager exists
    const existingRM = await RelationshipManager.findById(req.params.id);
    if (!existingRM) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }

    // Regional Manager can only edit relationship managers under them
    if (req.user.role === 'regional_manager') {
      if (existingRM.regionalManager?.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update relationship managers associated with you.',
        });
      }
    }

    const updatePayload = { ...req.body };
    if (req.user.role !== 'super_admin') {
      delete updatePayload.regionalManager;
    }
    if (updatePayload.regionalManager !== undefined) {
      if (!updatePayload.regionalManager) {
        updatePayload.regionalManager = null;
      } else {
        const rm = await User.findById(updatePayload.regionalManager);
        if (!rm || rm.role !== 'regional_manager') {
          return res.status(400).json({
            success: false,
            message: 'Invalid regional manager.',
          });
        }
      }
    }
    const relationshipManager = await RelationshipManager.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
      runValidators: true,
    })
      .populate('owner', 'name email')
      .populate('regionalManager', 'name email');

    if (!relationshipManager) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Relationship manager updated successfully',
      data: relationshipManager,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Relationship Manager Status
 */
export const updateRelationshipManagerStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const relationshipManager = await RelationshipManager.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('owner', 'name email');

    if (!relationshipManager) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Relationship manager status updated',
      data: relationshipManager,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get relationship manager franchises
 */
export const getRelationshipManagerFranchises = async (req, res, next) => {
  try {
    let rmUserId;
    const rmDoc = await RelationshipManager.findById(req.params.id);
    if (rmDoc?.owner) {
      rmUserId = rmDoc.owner;
    } else {
      const rmUser = await User.findById(req.params.id).select('role');
      if (rmUser?.role === 'relationship_manager') rmUserId = rmUser._id;
    }
    if (!rmUserId) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }

    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    // Relationship managers are not linked to franchises in the updated hierarchy.
    // Return empty result set.
    const franchises = [];
    const total = 0;
    const pagination = getPaginationMeta(page, limit, total);

    res.status(200).json({
      success: true,
      data: franchises,
      pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get relationship manager performance metrics
 */
export const getRelationshipManagerPerformance = async (req, res, next) => {
  try {
    let rmUserId;
    const rmDoc = await RelationshipManager.findById(req.params.id);
    if (rmDoc?.owner) {
      rmUserId = rmDoc.owner;
    } else {
      const rmUser = await User.findById(req.params.id).select('role');
      if (rmUser?.role === 'relationship_manager') rmUserId = rmUser._id;
    }
    if (!rmUserId) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }

    // Relationship managers are not linked to franchises; return zeroed metrics.
    const totalFranchises = 0;
    const totalAgents = 0;
    const totalLeads = 0;
    const totalCommission = 0;

    const relationshipManager = await RelationshipManager.findOne({ owner: rmUserId });
    if (relationshipManager) {
      relationshipManager.performanceMetrics = {
        totalLeads: 0,
        activeFranchises: 0,
        totalCommission: 0,
        lastUpdated: new Date(),
      };
      await relationshipManager.save();
    }

    res.status(200).json({
      success: true,
      data: {
        totalFranchises,
        totalAgents,
        totalLeads,
        totalCommission,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Relationship Manager
 */
export const deleteRelationshipManager = async (req, res, next) => {
  try {
    const relationshipManager = await RelationshipManager.findById(req.params.id);

    if (!relationshipManager) {
      return res.status(404).json({
        success: false,
        message: 'Relationship manager not found',
      });
    }
    
    // Log deletion to audit log
    const rmData = relationshipManager.toObject();
    await auditService.logDelete(req.user._id, 'RelationshipManager', req.params.id, rmData, req);
    
    await RelationshipManager.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Relationship manager deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
