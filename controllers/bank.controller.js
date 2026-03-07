import Bank from '../models/bank.model.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Bank
 */
export const createBank = async (req, res, next) => {
  try {
    // #region agent log
    const logPath = 'c:\\Users\\UNIQUE\\Desktop\\YKC\\.cursor\\debug.log';
    const logData = { location: 'bank.controller.js:13', message: 'Creating bank - received data', data: req.body, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' };
    console.log('🔍 DEBUG: Received bank data:', JSON.stringify(req.body, null, 2));
    console.log('🔍 DEBUG: Field check:', {
      name: req.body.name,
      type: req.body.type,
      contactEmail: req.body.contactEmail,
      contactMobile: req.body.contactMobile,
      contactPerson: req.body.contactPerson,
      status: req.body.status
    });
    try {
      // Ensure directory exists
      const dir = path.dirname(logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
    } catch (logError) {
      console.error('Log write error:', logError.message);
    }
    // #endregion
    
    // Validate required fields before creating
    if (!req.body.name || !req.body.type) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${!req.body.name ? 'name ' : ''}${!req.body.type ? 'type' : ''}`.trim(),
      });
    }
    
    const bank = await Bank.create(req.body);

    // #region agent log
    const logData2 = { location: 'bank.controller.js:24', message: 'Bank created successfully', data: { id: bank._id, name: bank.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' };
    console.log('✅ DEBUG: Bank created successfully:', bank._id);
    try {
      fs.appendFileSync(logPath, JSON.stringify(logData2) + '\n');
    } catch (logError) {
      console.error('Log write error:', logError.message);
    }
    // #endregion

    res.status(201).json({
      success: true,
      data: bank,
    });
  } catch (error) {
    // #region agent log
    const logPath = 'c:\\Users\\UNIQUE\\Desktop\\YKC\\.cursor\\debug.log';
    const logData3 = { location: 'bank.controller.js:35', message: 'Error creating bank', data: { error: error.message, receivedData: req.body }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' };
    console.error('❌ DEBUG: Error creating bank:', error.message);
    console.error('❌ DEBUG: Received data:', JSON.stringify(req.body, null, 2));
    try {
      fs.appendFileSync(logPath, JSON.stringify(logData3) + '\n');
    } catch (logError) {
      console.error('Log write error:', logError.message);
    }
    // #endregion
    next(error);
  }
};

/**
 * Get All Banks
 */
export const getBanks = async (req, res, next) => {
  try {
    const banks = await Bank.find();

    res.status(200).json({
      success: true,
      data: banks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Bank By ID
 */
export const getBankById = async (req, res, next) => {
  try {
    const bank = await Bank.findById(req.params.id);

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found',
      });
    }

    res.status(200).json({
      success: true,
      data: bank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Bank
 */
export const updateBank = async (req, res, next) => {
  try {
    const bank = await Bank.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found',
      });
    }

    res.status(200).json({
      success: true,
      data: bank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Bank Status
 */
export const updateBankStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const bank = await Bank.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank status updated',
      data: bank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send email to bank
 */
export const sendBankEmail = async (req, res, next) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found',
      });
    }

    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required',
      });
    }

    const Lead = (await import('../models/lead.model.js')).default;
    const lead = await Lead.findById(leadId)
      .populate('agent', 'name email');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    const emailService = (await import('../services/email.service.js')).default;
    await emailService.sendBankEmail(bank, lead);

    res.status(200).json({
      success: true,
      message: 'Email sent to bank successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Bank
 */
export const deleteBank = async (req, res, next) => {
  try {
    const bank = await Bank.findByIdAndDelete(req.params.id);

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Bank not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
