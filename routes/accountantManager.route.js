import { Router } from 'express';
import {
    getAccountantManagers,
    getAccountantManagerById,
    createAccountantManager,
    updateAccountantManager,
    deleteAccountantManager,
} from '../controllers/accountantManager.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import User from '../models/user.model.js';
import Franchise from '../models/franchise.model.js';
import RelationshipManager from '../models/relationship.model.js';
import Accountant from '../models/accountant.model.js';

const accountantManagerRouter = Router();

accountantManagerRouter.use(authenticate);

/**
 * GET /accountant-managers/contacts
 * Returns the accountant(s) associated with the requesting agent/franchise/RM
 * by tracing: agent.managedBy → franchise/RM.regionalManager → Accountant.assignedRegionalManagers
 */
accountantManagerRouter.get('/contacts', requireRole('super_admin', 'agent', 'franchise', 'relationship_manager', 'regional_manager', 'accounts_manager'), async (req, res, next) => {
    try {
        const { role, _id } = req.user;

        // Super admin / accounts_manager — return all active accountants
        if (role === 'super_admin' || role === 'accounts_manager') {
            const accountants = await User.find({ role: 'accounts_manager', status: 'active' })
                .select('name email phone mobile')
                .sort({ name: 1 });
            return res.status(200).json({ success: true, data: accountants });
        }

        // Step 1: resolve regional manager ID for the requesting user
        let regionalManagerId = null;

        if (role === 'regional_manager') {
            regionalManagerId = _id;
        } else if (role === 'agent') {
            // Agent → managedBy (Franchise doc or RelationshipManager doc)
            const agent = await User.findById(_id).select('managedBy managedByModel');
            if (agent?.managedBy && agent.managedByModel === 'Franchise') {
                const franchise = await Franchise.findById(agent.managedBy).select('regionalManager');
                regionalManagerId = franchise?.regionalManager || null;
            } else if (agent?.managedBy && agent.managedByModel === 'RelationshipManager') {
                const rm = await RelationshipManager.findById(agent.managedBy).select('regionalManager');
                regionalManagerId = rm?.regionalManager || null;
            }
        } else if (role === 'franchise') {
            // Franchise owner — find the Franchise doc they own
            const franchise = await Franchise.findOne({ owner: _id }).select('regionalManager');
            if (!franchise) {
                // fallback: find by franchiseOwned on user
                const userDoc = await User.findById(_id).select('franchiseOwned');
                const f = await Franchise.findById(userDoc?.franchiseOwned).select('regionalManager');
                regionalManagerId = f?.regionalManager || null;
            } else {
                regionalManagerId = franchise?.regionalManager || null;
            }
        } else if (role === 'relationship_manager') {
            // Find the RM doc linked to this user
            const rm = await RelationshipManager.findOne({ owner: _id }).select('regionalManager');
            regionalManagerId = rm?.regionalManager || null;
        }

        if (!regionalManagerId) {
            // No regional manager found — return empty
            return res.status(200).json({ success: true, data: [] });
        }

        // Step 2: find Accountant profiles that have this regional manager assigned
        const accountantDocs = await Accountant.find({
            assignedRegionalManagers: regionalManagerId,
            status: 'active',
        }).select('user name email mobile');

        // Step 3: return the linked User accounts_manager records
        const userIds = accountantDocs.map(a => a.user).filter(Boolean);
        let accountantUsers = [];
        if (userIds.length > 0) {
            accountantUsers = await User.find({ _id: { $in: userIds }, status: 'active' })
                .select('name email phone mobile');
        }

        // Fallback: if Accountant.user not set, use fields directly from the Accountant doc
        if (accountantUsers.length === 0 && accountantDocs.length > 0) {
            accountantUsers = accountantDocs.map(a => ({
                _id: a._id,
                name: a.name,
                email: a.email,
                phone: a.mobile,
                mobile: a.mobile,
            }));
        }

        return res.status(200).json({ success: true, data: accountantUsers });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /accountant-managers/regional-manager
 * Returns the Regional Manager for the requesting agent
 * by tracing: agent.managedBy (Franchise/RM) → .regionalManager → User
 */
accountantManagerRouter.get('/regional-manager', requireRole('agent', 'franchise', 'relationship_manager'), async (req, res, next) => {
    try {
        const { role, _id } = req.user;
        let regionalManagerId = null;

        if (role === 'agent') {
            const agent = await User.findById(_id).select('managedBy managedByModel');
            if (agent?.managedBy && agent.managedByModel === 'Franchise') {
                const franchise = await Franchise.findById(agent.managedBy).select('regionalManager');
                regionalManagerId = franchise?.regionalManager || null;
            } else if (agent?.managedBy && agent.managedByModel === 'RelationshipManager') {
                const rm = await RelationshipManager.findById(agent.managedBy).select('regionalManager');
                regionalManagerId = rm?.regionalManager || null;
            }
        } else if (role === 'franchise') {
            const franchise = await Franchise.findOne({ owner: _id }).select('regionalManager')
                || await (async () => {
                    const u = await User.findById(_id).select('franchiseOwned');
                    return Franchise.findById(u?.franchiseOwned).select('regionalManager');
                })();
            regionalManagerId = franchise?.regionalManager || null;
        } else if (role === 'relationship_manager') {
            const rm = await RelationshipManager.findOne({ owner: _id }).select('regionalManager');
            regionalManagerId = rm?.regionalManager || null;
        }

        if (!regionalManagerId) {
            return res.status(200).json({ success: true, data: null });
        }

        const rmUser = await User.findById(regionalManagerId).select('name email phone mobile address status');
        return res.status(200).json({ success: true, data: rmUser || null });
    } catch (err) {
        next(err);
    }
});

// All remaining routes require super_admin
accountantManagerRouter.use(requireRole('super_admin'));

accountantManagerRouter.get('/', getAccountantManagers);
accountantManagerRouter.get('/:id', getAccountantManagerById);
accountantManagerRouter.post('/', createAccountantManager);
accountantManagerRouter.put('/:id', updateAccountantManager);
accountantManagerRouter.delete('/:id', deleteAccountantManager);
accountantManagerRouter.put('/:id/status', updateAccountantManager);

export default accountantManagerRouter;
