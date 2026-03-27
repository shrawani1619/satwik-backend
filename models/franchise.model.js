import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const formatGst = (value) =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 15);

const isValidGst = (gst) => {
  const formatted = formatGst(gst);
  if (!formatted) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]{1}$/.test(formatted);
};

/**
 * Franchise model - canonical version
 * - Combines account/auth fields and profile/performance metadata
 * - Ensures a single default export
 */
const franchiseSchema = new mongoose.Schema(
  {
    // Identity / Auth
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    mobile: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },


    role: {
      type: String,
      default: 'franchise',
    },

    // Owner / linking
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    ownerName: String,

    // Commission structure / business fields
    commissionPercentage: {
      type: Number,
      default: 0,
    },
    commissionStructure: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // KYC and bank info
    kyc: {
      pan: String,
      aadhaar: String,
      gst: {
        type: String,
        validate: {
          validator: function (v) {
            if (v == null || String(v).trim() === '') return true; // allow empty
            return isValidGst(v);
          },
          message: 'Invalid GST number',
        },
      },
      verified: {
        type: Boolean,
        default: false,
      },
    },

    bankDetails: {
      accountHolderName: String,
      accountNumber: String,
      branch: String,
      ifsc: String,
      bankName: String,
    },

    // Profile / management fields
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true,
    },

    franchiseType: {
      type: String,
      enum: ['normal', 'GST'],
      default: 'normal',
      index: true,
    },

    city: {
      type: String,
      required: false,
      trim: true,
    },

    lastLoginAt: Date,

    // Performance metrics
    performanceMetrics: {
      totalLeads: {
        type: Number,
        default: 0,
      },
      activeAgents: {
        type: Number,
        default: 0,
      },
      totalCommission: {
        type: Number,
        default: 0,
      },
      lastUpdated: Date,
    },

    regionalManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Address and misc metadata
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
  },
  { timestamps: true }
);

// Indexes
franchiseSchema.index({ owner: 1, status: 1 });
franchiseSchema.index({ status: 1 });
franchiseSchema.index({ regionalManager: 1 });
// Note: Authentication credentials (password) are stored on the related User model.
// Franchise is a profile document and should not contain password fields.

export default mongoose.model('Franchise', franchiseSchema);
