import mongoose from 'mongoose';

/**
 * Company Settings Model
 * Stores company information used across the application (e.g., in invoices)
 */
const companySettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      default: 'Satwik Network',
    },
    address: {
      type: String,
      required: true,
      default:
        'F-3, 3rd Floor, Gangadhar Chambers Co Op Society, Opposite Prabhat Press, Narayan Peth, Pune, Maharashtra 411030',
    },
    gstNo: {
      type: String,
      required: true,
      default: '27AABCY2731J28',
    },
    panNo: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: false,
    },
    mobile: {
      type: String,
      required: false,
      default: '9130011700',
    },
    // Bank details for company
    bankDetails: {
      bankName: {
        type: String,
        default: 'STATE BANK OF INDIA',
      },
      accountNumber: {
        type: String,
        default: '43726535738',
      },
      ifsc: {
        type: String,
        default: 'SBIN0018880',
      },
      branch: {
        type: String,
        default: 'TATHAWADE PUNE',
      },
    },
    // Tax configuration
    taxConfig: {
      cgstRate: {
        type: Number,
        default: 9, // 9%
      },
      sgstRate: {
        type: Number,
        default: 9, // 9%
      },
      defaultTdsRate: {
        type: Number,
        default: 2, // 2%
      },
    },
  },
  { timestamps: true }
);

// Ensure only one company settings document exists
const YKC_COMPANY_NAME = 'YKC finserv PVT. LTD';
const LEGACY_ADDRESS_ONE_LINE =
  'F-3, 3rd Floor, Gangadhar Chambers Co Op Society, Opposite Prabhat Press, Narayan Peth, Pune, Maharashtra 411030';
const DEFAULT_ADDRESS_MULTILINE =
  'F-3, 3rd Floor, Gangadhar Chambers Co Op Society, Opposite Prabhat\nPress, Narayan Peth, Pune, Maharashtra 411030';

companySettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  } else if (settings.companyName === YKC_COMPANY_NAME) {
    settings.companyName = 'Satwik Network';
    const addrNorm = (settings.address || '').replace(/\s+/g, ' ').trim();
    const ykcLegacyMultilineNorm = DEFAULT_ADDRESS_MULTILINE.replace(/\s+/g, ' ');
    if (!addrNorm || addrNorm === ykcLegacyMultilineNorm) {
      settings.address = LEGACY_ADDRESS_ONE_LINE;
    }
    await settings.save();
  }
  return settings;
};

export default mongoose.model('CompanySettings', companySettingsSchema);

