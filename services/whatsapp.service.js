import dotenv from 'dotenv';
import Lead from '../models/lead.model.js';

dotenv.config();

const {
  WHATSAPP_META_PHONE_NUMBER_ID,
  WHATSAPP_META_ACCESS_TOKEN,
} = process.env;

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Customer-facing status: workflow enums (snake_case, no spaces) → UPPER_SNAKE;
 * free-form labels (spaces or mixed phrasing) stay as readable text.
 */
function formatStatusForCustomerMessage(status) {
  if (status == null || status === '') return '';
  const s = String(status).trim();
  if (!/\s/.test(s) && /^[a-z0-9_]+$/i.test(s)) {
    return s.toUpperCase();
  }
  return s.replace(/\s+/g, ' ');
}

/**
 * Format branch name as Title Case for WhatsApp.
 * Examples: "alandi" -> "Alandi", "kharadi-wagholi" -> "Kharadi-Wagholi"
 */
function formatBranchForCustomerMessage(branch) {
  if (branch == null) return '';
  const raw = String(branch).trim();
  if (!raw) return '';
  return raw.toUpperCase();
}

const whatsappService = {
  /**
   * Send a WhatsApp message using Meta WhatsApp Cloud API.
   * `phone` must be in international format without "+" (e.g. 91XXXXXXXXXX).
   */
  async sendMessage(phone, body) {
    if (!WHATSAPP_META_PHONE_NUMBER_ID || !WHATSAPP_META_ACCESS_TOKEN) {
      console.warn('WhatsApp (Meta) credentials not configured. Skipping WhatsApp send.');
      return null;
    }

    if (!phone) {
      console.warn('WhatsApp send skipped: no phone number provided.');
      return null;
    }

    try {
      const url = `${GRAPH_API_BASE}/${WHATSAPP_META_PHONE_NUMBER_ID}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'text',
        text: {
          body,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHATSAPP_META_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('Error sending WhatsApp message via Meta:', res.status, res.statusText, errorText);
        return null;
      }

      const data = await res.json().catch(() => null);
      const msgId = data?.messages?.[0]?.id;
      console.log(
        `✅ WhatsApp sent via Meta${msgId ? ` (id: ${msgId})` : ''} to ${payload.to}`
      );
      return data;
    } catch (err) {
      console.error('Error sending WhatsApp message:', err);
      return null;
    }
  },

  /**
   * Convenience: send lead status update to the applicant mobile.
   */
  async sendLeadStatusUpdate(leadId, _oldStatus, newStatus) {
    try {
      const lead = await Lead.findById(leadId).select(
        'customerName applicantMobile loanType loanAmount status branch'
      );
      if (!lead) {
        console.warn('WhatsApp send skipped: lead not found', leadId);
        return null;
      }

      const mobile = lead.applicantMobile;
      if (!mobile) {
        console.warn('WhatsApp send skipped: lead has no applicantMobile', leadId);
        return null;
      }

      const name = lead.customerName || 'Customer';
      const loanType = (lead.loanType || '').replace(/_/g, ' ');
      const amount = lead.loanAmount != null ? `₹${lead.loanAmount}` : '';
      const statusLine = newStatus
        ? `Current status: ${formatStatusForCustomerMessage(newStatus)}`
        : null;
      const branchLine =
        lead.branch && String(lead.branch).trim()
          ? `Branch Name - ${formatBranchForCustomerMessage(lead.branch)}`
          : null;

      const messageLines = [
        `Hello ${name},`,
        '',
        'Your application status has been updated on Satwik Network.',
        statusLine,
        branchLine,
        loanType ? `Loan type: ${loanType}` : null,
        amount ? `Loan amount: ${amount}` : null,
        '',
        'Thank you for choosing us.',
      ].filter(Boolean);

      const body = messageLines.join('\n');

      return await this.sendMessage(mobile, body);
    } catch (err) {
      console.error('Error in sendLeadStatusUpdate:', err);
      return null;
    }
  },
};

export default whatsappService;

