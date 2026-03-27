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

const agentSchema = new mongoose.Schema(
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
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      default: 'agent',
    },

    // Link to either a Franchise or a RelationshipManager.
    // Uses Mongoose's dynamic ref (refPath) so the agent can be owned/managed by
    // one of multiple model types.
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'managedByModel',
      required: true,
      index: true,
    },
    managedByModel: {
      type: String,
      required: true,
      enum: ['Franchise', 'RelationshipManager'],
      index: true,
    },

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

    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },

    agentType: {
      type: String,
      enum: ['normal', 'GST'],
      default: 'normal',
    },

    city: {
      type: String,
      required: false,
      trim: true,
    },

    lastLoginAt: Date,
  },
  { timestamps: true }
);

// Hash password before saving
agentSchema.pre('save', async function (next) {
  if(!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
})

// Compare password method
agentSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('Agent', agentSchema);
    