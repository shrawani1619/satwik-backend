import mongoose from 'mongoose';

/**
 * Bank/NBFC Model (Enhanced)
 * Manages bank and NBFC configurations including commission rules and document requirements
 */
const bankSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['bank', 'nbfc'],
      required: true,
    },

    // Contact details
    contactEmail: {
      type: String,
      lowercase: true,
    },

    contactPerson: String,
    contactMobile: String,

    // Indian Bank Details
    ifscCode: {
      type: String,
      uppercase: true,
      index: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        },
        message: 'IFSC code must be 11 characters (e.g., HDFC0001234)'
      }
    },
    micrCode: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^\d{9}$/.test(v);
        },
        message: 'MICR code must be 9 digits'
      }
    },
    branchName: String,
    branchAddress: String,
    city: String,
    state: String,
    pinCode: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^\d{6}$/.test(v);
        },
        message: 'PIN code must be 6 digits'
      }
    },
    accountNumber: String,
    registrationNumber: String, // For NBFCs

    // Loan types supported by this bank
    loanTypes: {
      type: [String],
      enum: ['personal_loan', 'home_loan', 'business_loan', 'loan_against_property', 'education_loan', 'car_loan', 'gold_loan'],
      default: [],
    },

    // Default commission basis for this bank
    commissionBasis: {
      type: String,
      enum: ['sanctioned', 'disbursed'],
      default: 'disbursed',
    },

    // Required documents for this bank
    requiredDocuments: [
      {
        type: String,
      },
    ],

    // Email template for bank communication
    emailTemplate: {
      subject: String,
      body: String,
    },

    // API configuration (if bank provides API integration)
    apiConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      endpoint: String,
      apiKey: String,
      credentials: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Custom fields for bank-specific data
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes
bankSchema.index({ type: 1, status: 1 });

export default mongoose.model('Bank', bankSchema);
