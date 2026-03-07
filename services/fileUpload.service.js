import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import Document from '../models/document.model.js';
import { sanitizeFilename, validateFileType } from '../utils/helpers.js';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allowed file types for uploads
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * File Upload Service
 * Handles file uploads, validation, and storage
 */
class FileUploadService {
  constructor() {
    // Use memory storage so we can upload to Cloudinary (or fallback to disk)
    this.storage = multer.memoryStorage();

    // Configure multer upload
    this.upload = multer({
      storage: this.storage,
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: (req, file, cb) => {
        if (validateFileType(file.mimetype, ALLOWED_FILE_TYPES)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`));
        }
      },
    });
  }

  /**
   * Get multer upload middleware
   * @param {String} fieldName - Form field name
   * @returns {Function} Multer middleware
   */
  getUploadMiddleware(fieldName = 'file') {
    return this.upload.single(fieldName);
  }

  /**
   * Accept any file fields (useful when clients send multiple named file inputs)
   * WARNING: returns all files in req.files array; controller should handle selection.
   */
  getAnyUploadMiddleware() {
    return this.upload.any();
  }

  /**
   * Get multer upload middleware for multiple files
   * @param {String} fieldName - Form field name
   * @param {Number} maxCount - Maximum number of files
   * @returns {Function} Multer middleware
   */
  getMultipleUploadMiddleware(fieldName = 'files', maxCount = 10) {
    return this.upload.array(fieldName, maxCount);
  }

  /**
   * Process uploaded file: upload to Cloudinary (if configured) or save to disk,
   * then persist document metadata to database.
   *
   * @param {Object} file - multer file object (memory buffer)
   * @param {Object} meta - metadata { entityType, entityId, documentType, description, uploadedBy }
   * @returns {Promise<Object>} Created Document
   */
  async processUploadedFile(file, meta) {
    if (!file) throw new Error('No file provided');

    // Configure Cloudinary if env vars available
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    let uploadResult = null;
    let provider = 'local';
    let finalFilePath = null;
    let fileName = null;
    let fileSize = file.size;

    if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      try {
        cloudinary.config({
          cloud_name: CLOUDINARY_CLOUD_NAME,
          api_key: CLOUDINARY_API_KEY,
          api_secret: CLOUDINARY_API_SECRET,
        });

        // Images use 'image', everything else (PDF, doc, xls…) uses 'raw' so Cloudinary
        // stores the original file bytes. Opening is handled by Google Docs Viewer on the frontend.
        const isImage = file.mimetype?.startsWith('image/');
        const resourceType = isImage ? 'image' : 'raw';

        // upload buffer via upload_stream using streamifier for reliability
        uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: resourceType, folder: 'documents' },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload callback error:', error && error.stack ? error.stack : error);
                return reject(error);
              }
              resolve(result);
            }
          );
          // Use streamifier to create a readable stream from the buffer and pipe it
          streamifier.createReadStream(file.buffer).pipe(stream);
        });

        console.log('Cloudinary upload successful:', {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          bytes: uploadResult.bytes,
        });

        provider = 'cloudinary';
        finalFilePath = uploadResult.secure_url;
        fileName = uploadResult.public_id;
        fileSize = uploadResult.bytes || file.size;
      } catch (error) {
        // If cloud upload fails, fallback to local disk storage
        console.error('Cloudinary upload failed, falling back to local. Error:', error.message);
        uploadResult = null;
      }
    }

    // Fallback to local disk storage if cloud not used or failed
    if (!uploadResult) {
      const uploadsDir = path.join(__dirname, '../uploads/documents');
      await fs.mkdir(uploadsDir, { recursive: true });
      const sanitized = sanitizeFilename(file.originalname);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(sanitized);
      const nameWithoutExt = path.basename(sanitized, ext);
      fileName = `${nameWithoutExt}-${uniqueSuffix}${ext}`;
      finalFilePath = path.join(uploadsDir, fileName);
      await fs.writeFile(finalFilePath, file.buffer);
      provider = 'local';
    }

    // Prepare document data for DB
    const documentData = {
      entityType: meta.entityType,
      entityId: meta.entityId,
      documentType: meta.documentType,
      fileName: fileName,
      originalFileName: file.originalname,
      filePath: finalFilePath,
      fileSize: fileSize,
      mimeType: file.mimetype,
      uploadedBy: meta.uploadedBy,
      description: meta.description || '',
      provider,
    };

    if (provider === 'cloudinary' && uploadResult) {
      documentData.url = uploadResult.secure_url;
      documentData.publicId = uploadResult.public_id;
      documentData.resourceType = uploadResult.resource_type;
    }

    // Save document metadata
    const document = await Document.create({
      ...documentData,
      verificationStatus: 'pending',
    });

    return document;
  }

  /**
   * Save document metadata to database
   * @param {Object} documentData - Document data
   * @returns {Promise<Object>} Created document
   */
  async saveDocument(documentData) {
    try {
      const {
        entityType,
        entityId,
        documentType,
        fileName,
        originalFileName,
        filePath,
        fileSize,
        mimeType,
        uploadedBy,
        description,
      } = documentData;

      const document = await Document.create({
        entityType,
        entityId,
        documentType,
        fileName,
        originalFileName,
        filePath,
        fileSize,
        mimeType,
        uploadedBy,
        description,
        verificationStatus: 'pending',
      });

      return document;
    } catch (error) {
      throw new Error(`Error saving document: ${error.message}`);
    }
  }

  /**
   * Delete document file and metadata
   * @param {ObjectId} documentId - Document ID
   * @returns {Promise<Boolean>} Success status
   */
  async deleteDocument(documentId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      // Delete file from filesystem
      try {
        await fs.unlink(document.filePath);
      } catch (error) {
        console.error(`Error deleting file: ${error.message}`);
      }

      // Delete document from database
      await Document.findByIdAndDelete(documentId);

      return true;
    } catch (error) {
      throw new Error(`Error deleting document: ${error.message}`);
    }
  }

  /**
   * Get documents for an entity
   * @param {String} entityType - Entity type
   * @param {ObjectId} entityId - Entity ID
   * @returns {Promise<Array>} Documents array
   */
  async getDocuments(entityType, entityId) {
    try {
      const documents = await Document.find({
        entityType,
        entityId,
      })
        .populate('uploadedBy', 'name email')
        .populate('verifiedBy', 'name email')
        .sort({ createdAt: -1 });

      return documents;
    } catch (error) {
      throw new Error(`Error fetching documents: ${error.message}`);
    }
  }

  /**
   * Verify document
   * @param {ObjectId} documentId - Document ID
   * @param {String} status - Verification status
   * @param {ObjectId} verifiedBy - User ID
   * @param {String} remarks - Verification remarks
   * @returns {Promise<Object>} Updated document
   */
  async verifyDocument(documentId, status, verifiedBy, remarks = '') {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      document.verificationStatus = status;
      document.verifiedBy = verifiedBy;
      document.verifiedAt = new Date();
      document.verificationRemarks = remarks;

      await document.save();

      return document;
    } catch (error) {
      throw new Error(`Error verifying document: ${error.message}`);
    }
  }
}

export default new FileUploadService();
