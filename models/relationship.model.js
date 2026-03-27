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
 * Merged RelationshipManager model
 * - Combines account/auth fields (credentials + hooks) and profile/performance metadata
 * - Replaces the separate relationshipManager.model.js to provide a single canonical model
 */
const relationshipSchema = new mongoose.Schema(
  {
    // Identity / Auth fields
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
      default: 'relationship_manager',
    },

    // Links to agents this Relationship Manager manages
    agents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        index: true,
      },
    ],

    // Reference to a user record that "owns" this account/profile if desired
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    ownerName: String,

    // Commission / business fields
    commissionPercentage: {
      type: Number,
      default: 0,
    },

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

    city: {
      type: String,
      required: false,
      trim: true,
    },

    lastLoginAt: Date,

    // Performance metrics & reporting
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

    // Operational links
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

// Indexes for common queries
relationshipSchema.index({ owner: 1, status: 1 });
relationshipSchema.index({ status: 1 });
relationshipSchema.index({ regionalManager: 1 });
// Note: Authentication credentials (password) are stored on the related User model.
// RelationshipManager is a profile document and should not contain password fields.

export default mongoose.model('RelationshipManager', relationshipSchema);

