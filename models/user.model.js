import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const normalizeMobileDigits = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits;
};

const isValidMobileDigits = (digits) => /^[6-9]\d{9}$/.test(digits);

const formatPan = (value) =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10);
const isValidPan = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formatPan(pan));

const normalizeAadhaarDigits = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 12);
const isValidAadhaar = (aadhaar) => /^\d{12}$/.test(normalizeAadhaarDigits(aadhaar));

const normalizeAccountNumber = (value) =>
  String(value ?? '').replace(/\D/g, '').slice(0, 18);
const isValidAccountNumber = (value) => {
  const acc = normalizeAccountNumber(value);
  return acc.length >= 9 && acc.length <= 18;
};

// Indian IFSC: 11 chars => 4 letters, 0, 6 letters/digits
const formatIFSC = (value) =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 11);
const isValidIFSC = (ifsc) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(formatIFSC(ifsc));

// Indian GSTIN: 15 chars (state(2) + PAN(10) + entity(1) + Z(1) + checksum(1))
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
 * Unified User Model
 * Consolidates Agent and Staff into a single user model with role-based access control
 * Supports: super_admin, relationship_manager, regional_manager, franchise, agent, accounts_manager
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
      validate: {
        validator: function (v) {
          const digits = normalizeMobileDigits(v);
          return isValidMobileDigits(digits);
        },
        message: 'Invalid mobile number',
      },
    },

    phone: {
      type: String,
      sparse: true,
    },

    profileImage: {
      type: String,
      default: null,
    },

    password: {
      type: String,
      // Password is not required for sub-agents (they don't log in)
      required: function () {
        return !this.parentAgent; // Not required if parentAgent exists (sub-agent)
      },
      select: false,
    },

    role: {
      type: String,
      enum: [
        'super_admin',
        'regional_manager',
        'franchise',
        'relationship_manager',
        'agent',
        'accounts_manager',
      ],
      required: true,
      index: true,
    },

    // Role-specific fields
    // For franchise owners (kept for backward compatibility)
    franchise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Franchise',
      // franchise field is required for users with role 'franchise' (franchise owner)
      required: function () {
        return this.role === 'franchise';
      },
    },

    // Flexible owner for agents: can be a Franchise or a RelationshipManager.
    // Uses dynamic ref via refPath.
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'managedByModel',
      required: function () {
        return this.role === 'agent';
      },
      index: true,
    },
    managedByModel: {
      type: String,
      enum: ['Franchise', 'RelationshipManager'],
    },

    // For franchise owners
    franchiseOwned: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Franchise',
      required: function () {
        return this.role === 'franchise';
      },
    },

    // For relationship managers
    relationshipManagerOwned: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RelationshipManager',
    },

    // For agents
    commissionPercentage: {
      type: Number,
      default: 0,
    },

    // For sub-agents: reference to parent agent
    parentAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Permissions array for granular access control
    permissions: {
      type: [String],
      default: [],
    },

    // KYC details (mainly for agents)
    kyc: {
      pan: {
        type: String,
        validate: {
          validator: function (v) {
            if (v == null || String(v).trim() === '') return true; // allow empty
            return isValidPan(v);
          },
          message: 'Invalid PAN number',
        },
      },
      aadhaar: {
        type: String,
        validate: {
          validator: function (v) {
            if (v == null || String(v).trim() === '') return true; // allow empty
            return isValidAadhaar(v);
          },
          message: 'Invalid Aadhaar number',
        },
      },
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

    // Bank details (mainly for agents)
    bankDetails: {
      accountHolderName: String,
      accountNumber: {
        type: String,
        validate: {
          validator: function (v) {
            if (v == null || String(v).trim() === '') return true; // allow empty
            return isValidAccountNumber(v);
          },
          message: 'Invalid account number',
        },
      },
      branch: String,
      ifsc: {
        type: String,
        validate: {
          validator: function (v) {
            if (v == null || String(v).trim() === '') return true; // allow empty
            return isValidIFSC(v);
          },
          message: 'Invalid IFSC code',
        },
      },
      bankName: String,
    },

    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true,
    },

    lastLoginAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Normalize KYC/bank fields so stored values are consistent.
// Note: findOneAndUpdate does not trigger `save` middleware; the frontend also formats inputs.
userSchema.pre('save', async function () {
  try {
    if (this.isModified('mobile') && this.mobile != null) {
      const normalized = normalizeMobileDigits(this.mobile);
      if (normalized) this.mobile = normalized;
    }

    if (this.kyc?.pan != null) {
      const normalizedPan = formatPan(this.kyc.pan);
      if (normalizedPan !== this.kyc.pan) this.kyc.pan = normalizedPan;
    }

    if (this.kyc?.aadhaar != null) {
      const normalizedAadhaar = normalizeAadhaarDigits(this.kyc.aadhaar);
      if (normalizedAadhaar !== this.kyc.aadhaar) this.kyc.aadhaar = normalizedAadhaar;
    }

    if (this.kyc?.gst != null) {
      const normalizedGst = formatGst(this.kyc.gst);
      if (normalizedGst !== this.kyc.gst) this.kyc.gst = normalizedGst;
    }

    if (this.bankDetails?.accountNumber != null) {
      const normalizedAcc = normalizeAccountNumber(this.bankDetails.accountNumber);
      if (normalizedAcc !== this.bankDetails.accountNumber) {
        this.bankDetails.accountNumber = normalizedAcc;
      }
    }

    if (this.bankDetails?.ifsc != null) {
      const normalizedIfsc = formatIFSC(this.bankDetails.ifsc);
      if (normalizedIfsc !== this.bankDetails.ifsc) {
        this.bankDetails.ifsc = normalizedIfsc;
      }
    }
  } catch (_) {
    // Do not block saving; validation will catch invalid formats.
  }
});

// Also normalize for update queries (so formats get stored consistently).
// These hooks are best-effort because update payload shapes can vary.
userSchema.pre(['findOneAndUpdate', 'findByIdAndUpdate', 'updateOne'], async function () {
  try {
    const update = this.getUpdate();
    if (!update) return;

    const set = update.$set ? update.$set : update;

    if (set.mobile != null) {
      set.mobile = normalizeMobileDigits(set.mobile);
    }

    if (set.kyc?.pan != null) {
      set.kyc.pan = formatPan(set.kyc.pan);
    }
    if (set['kyc.pan'] != null) {
      set['kyc.pan'] = formatPan(set['kyc.pan']);
    }

    if (set.kyc?.aadhaar != null) {
      set.kyc.aadhaar = normalizeAadhaarDigits(set.kyc.aadhaar);
    }
    if (set['kyc.aadhaar'] != null) {
      set['kyc.aadhaar'] = normalizeAadhaarDigits(set['kyc.aadhaar']);
    }

    if (set.kyc?.gst != null) {
      set.kyc.gst = formatGst(set.kyc.gst);
    }
    if (set['kyc.gst'] != null) {
      set['kyc.gst'] = formatGst(set['kyc.gst']);
    }

    if (set.bankDetails?.accountNumber != null) {
      set.bankDetails.accountNumber = normalizeAccountNumber(set.bankDetails.accountNumber);
    }
    if (set['bankDetails.accountNumber'] != null) {
      set['bankDetails.accountNumber'] = normalizeAccountNumber(set['bankDetails.accountNumber']);
    }

    if (set.bankDetails?.ifsc != null) {
      set.bankDetails.ifsc = formatIFSC(set.bankDetails.ifsc);
    }
    if (set['bankDetails.ifsc'] != null) {
      set['bankDetails.ifsc'] = formatIFSC(set['bankDetails.ifsc']);
    }
  } catch (_) {
    // ignore and let validators decide
  }
});

// Index for efficient queries
userSchema.index({ role: 1, status: 1 });
userSchema.index({ franchise: 1, role: 1 });
userSchema.index({ managedBy: 1, role: 1 });
userSchema.index({ parentAgent: 1, role: 1 });

// Compare password method (supports both plain text and bcrypt hashed passwords)
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) {
    console.log('❌ No password stored for user');
    return false;
  }

  // Check if password is bcrypt hashed (starts with $2a$, $2b$, or $2y$)
  const isHashed = this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$') || this.password.startsWith('$2y$'));
  
  if (isHashed) {
    // Password is hashed, use bcrypt comparison
    console.log('🔐 Comparing bcrypt hashed password');
    const result = await bcrypt.compare(enteredPassword, this.password);
    console.log('🔐 Bcrypt comparison result:', result);
    return result;
  }
  
  // Password is plain text, use direct comparison
  console.log('🔐 Comparing plain text password');
  console.log('🔐 Entered password length:', enteredPassword?.length);
  console.log('🔐 Stored password length:', this.password?.length);
  console.log('🔐 Passwords match:', enteredPassword === this.password);
  return enteredPassword === this.password;
};

// Method to check if user has permission
userSchema.methods.hasPermission = function (permission) {
  if (['super_admin', 'regional_manager'].includes(this.role)) return true;
  return this.permissions.includes(permission);
};

export default mongoose.model('User', userSchema);
