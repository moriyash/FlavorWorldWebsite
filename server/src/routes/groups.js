import express from 'express';
import mongoose from 'mongoose';
import upload from '../middleware/upload.js';
import { isMongoConnected } from '../config/database.js';
import Group from '../models/Group.js';
import GroupPost from '../models/GroupPost.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/', upload.any(), async (req, res) => {
  try {
    console.log('=== Create Group Debug ===');
    console.log('MongoDB connected:', isMongoConnected());
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const formData = req.body;
    console.log('Group data received:', formData);

    if (!formData.name || formData.name.trim() === '') {
      return res.status(400).json({ message: 'Group name is required' });
    }

    if (!formData.creatorId) {
      return res.status(400).json({ message: 'Creator ID is required' });
    }

    let imageData = null;
    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find(file => 
        file.fieldname === 'image' || 
        file.mimetype.startsWith('image/')
      );
      
      if (imageFile) {
        const base64Image = imageFile.buffer.toString('base64');
        imageData = `data:${imageFile.mimetype};base64,${base64Image}`;
        console.log('Group image converted to base64');
      }
    }

    if (!imageData && formData.image) {
      imageData = formData.image;
    }

    const groupData = {
      name: formData.name.trim(),
      description: formData.description || '',
      image: imageData,
      creatorId: formData.creatorId,
      isPrivate: formData.isPrivate === 'true' || formData.isPrivate === true,
      category: formData.category || 'General',
      rules: formData.rules || '',
      members: [{
        userId: formData.creatorId,
        role: 'admin',
        joinedAt: new Date()
      }],
      pendingRequests: [],
      settings: {
        allowMemberPosts: formData.allowMemberPosts !== 'false',
        requireApproval: formData.isPrivate === 'true' || formData.isPrivate === true ? (formData.requireApproval === 'true' || formData.requireApproval === true) : false, 
        allowInvites: formData.allowInvites !== 'false'
      }
    };

    const group = new Group(groupData);
    const savedGroup = await group.save();
    
    console.log('Group created successfully:', savedGroup._id);

    const creator = await User.findById(savedGroup.creatorId);
    const enrichedGroup = {
      ...savedGroup.toObject(),
      creatorName: creator ? creator.fullName : 'Unknown',
      creatorAvatar: creator ? creator.avatar : null,
      membersCount: savedGroup.members.length,
      postsCount: 0
    };

    res.status(201).json(enrichedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create group' });
  }
});

router.get('/search', async (req, res) => {
  try {
    console.log('Groups search request:', req.query);
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { q, userId, includePrivate } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    console.log(`Searching groups with query: "${q}"`);

    const searchConditions = {
      $and: [
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { category: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    };

    if (includePrivate !== 'true') {
      if (userId) {
        searchConditions.$and.push({
          $or: [
            { isPrivate: { $ne: true } },
            { 'members.userId': userId }
          ]
        });
      } else {
        searchConditions.$and.push({ isPrivate: { $ne: true } });
      }
    }

    console.log('Search conditions:', JSON.stringify(searchConditions, null, 2));

    const groups = await Group.find(searchConditions).limit(50).sort({ 
      createdAt: -1 
    });

    console.log(`Found ${groups.length} groups matching search`);

    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        try {
          const creator = await User.findById(group.creatorId);
          const membersCount = group.members ? group.members.length : 0;
          
          let postsCount = 0;
          try {
            postsCount = await GroupPost.countDocuments({ 
              groupId: group._id, 
              isApproved: true 
            });
          } catch (error) {
            console.log('Could not count posts for group:', group._id);
          }

          return {
            _id: group._id,
            name: group.name,
            description: group.description,
            category: group.category,
            image: group.image,
            isPrivate: group.isPrivate || false,
            creatorId: group.creatorId,
            creatorName: creator ? creator.fullName : 'Unknown',
            creatorAvatar: creator ? creator.avatar : null,
            membersCount,
            postsCount,
            members: group.members || [],
            pendingRequests: group.pendingRequests || [],
            settings: group.settings || {},
            allowMemberPosts: group.settings?.allowMemberPosts ?? group.allowMemberPosts ?? true,
            requireApproval: group.settings?.requireApproval ?? group.requireApproval ?? false,
            createdAt: group.createdAt
          };
        } catch (error) {
          return null;
        }
      })
    );

    const validResults = enrichedGroups.filter(group => group !== null);

    console.log(`Returning ${validResults.length} groups for search query: "${q}"`);
    res.json(validResults);
    
  } catch (error) {
    res.status(500).json({ message: 'Failed to search groups' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId } = req.query;
    
    let groups;
    if (userId) {
      groups = await Group.find({
        $or: [
          { isPrivate: false },
          { 'members.userId': userId }
        ]
      }).sort({ createdAt: -1 });
    } else {
      groups = await Group.find({ isPrivate: false }).sort({ createdAt: -1 });
    }

    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        const creator = await User.findById(group.creatorId);
        const postsCount = await GroupPost.countDocuments({ groupId: group._id });
        
        return {
          ...group.toObject(),
          creatorName: creator ? creator.fullName : 'Unknown',
          creatorAvatar: creator ? creator.avatar : null,
          membersCount: group.members.length,
          postsCount: postsCount
        };
      })
    );

    res.json(enrichedGroups);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch groups' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    console.log('Get single group request:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    console.log('Group found:', group.name);

    try {
      const creator = await User.findById(group.creatorId);
      
      let postsCount = 0;
      try {
        postsCount = await GroupPost.countDocuments({ 
          groupId: group._id, 
          isApproved: true 
        });
      } catch (error) {
        console.log('Could not count posts for group:', group._id);
      }
      
      const membersDetails = await Promise.all(
        (group.members || []).map(async (member) => {
          try {
            const user = await User.findById(member.userId);
            return {
              userId: member.userId,
              role: member.role || 'member',
              joinedAt: member.joinedAt || member.createdAt,
              userName: user ? user.fullName : 'Unknown User',
              userAvatar: user ? user.avatar : null,
              userEmail: user ? user.email : null
            };
          } catch (error) {
            return {
              userId: member.userId,
              role: member.role || 'member',
              joinedAt: member.joinedAt,
              userName: 'Unknown User',
              userAvatar: null,
              userEmail: null
            };
          }
        })
      );

      console.log('Processing pending requests:', group.pendingRequests?.length || 0);
      
      const pendingRequestsDetails = await Promise.all(
        (group.pendingRequests || []).map(async (request) => {
          try {
            console.log('Fetching user details for request:', request.userId);
            const user = await User.findById(request.userId);
            
            if (!user) {
              console.log('User not found for request:', request.userId);
              return {
                userId: request.userId,
                requestDate: request.createdAt || request.requestDate || new Date(),
                userName: 'Unknown User',
                userAvatar: null,
                userBio: null,
                userEmail: null
              };
            }
            
            console.log('Found user for request:', user.fullName);
            return {
              userId: request.userId,
              requestDate: request.createdAt || request.requestDate || new Date(),
              userName: user.fullName || user.name || 'Unknown User',
              userAvatar: user.avatar,
              userBio: user.bio,
              userEmail: user.email
            };
          } catch (error) {
            return {
              userId: request.userId,
              requestDate: request.createdAt || new Date(),
              userName: 'Unknown User',
              userAvatar: null,
              userBio: null,
              userEmail: null
            };
          }
        })
      );

      console.log('Pending requests details processed:', {
        totalRequests: pendingRequestsDetails.length,
        usersFound: pendingRequestsDetails.filter(r => r.userName !== 'Unknown User').length,
        unknownUsers: pendingRequestsDetails.filter(r => r.userName === 'Unknown User').length
      });

      const enrichedGroup = {
        _id: group._id,
        name: group.name,
        description: group.description,
        category: group.category,
        image: group.image,
        isPrivate: group.isPrivate || false,
        creatorId: group.creatorId,
        creatorName: creator ? creator.fullName : 'Unknown',
        creatorAvatar: creator ? creator.avatar : null,
        membersCount: (group.members || []).length,
        postsCount,
        members: group.members || [],
        membersDetails,
        pendingRequests: group.pendingRequests || [],
        pendingRequestsDetails, 
        settings: group.settings || {
          allowMemberPosts: group.allowMemberPosts ?? true,
          requireApproval: group.requireApproval ?? false,
          allowInvites: group.allowInvites ?? true
        },
        allowMemberPosts: group.settings?.allowMemberPosts ?? group.allowMemberPosts ?? true,
        requireApproval: group.settings?.requireApproval ?? group.requireApproval ?? false,
        allowInvites: group.settings?.allowInvites ?? group.allowInvites ?? true,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      };

      console.log('Group enriched successfully:', {
        name: enrichedGroup.name,
        membersCount: enrichedGroup.membersCount,
        postsCount: enrichedGroup.postsCount,
        pendingRequestsCount: enrichedGroup.pendingRequests.length,
        pendingRequestsWithDetails: enrichedGroup.pendingRequestsDetails.length
      });

      res.json(enrichedGroup);
      
    } catch (enrichError) {
      res.json({
        _id: group._id,
        name: group.name,
        description: group.description,
        category: group.category,
        image: group.image,
        isPrivate: group.isPrivate || false,
        creatorId: group.creatorId,
        creatorName: 'Unknown',
        creatorAvatar: null,
        membersCount: (group.members || []).length,
        postsCount: 0,
        members: group.members || [],
        membersDetails: [],
        pendingRequests: group.pendingRequests || [],
        pendingRequestsDetails: [], 
        settings: {},
        allowMemberPosts: true,
        requireApproval: false,
        allowInvites: true,
        createdAt: group.createdAt
      });
    }
    
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group' });
  }
});

router.post('/:groupId/join', async (req, res) => {
  try {
    console.log('Join group request:', req.params.groupId);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    console.log('Group found:', group.name);

    const isMember = group.members.some(member => 
      member.userId === userId || member.userId?.toString() === userId?.toString()
    );

    if (isMember) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    const hasPendingRequest = group.pendingRequests.some(request => 
      request.userId === userId || request.userId?.toString() === userId?.toString()
    );

    if (hasPendingRequest) {
      return res.status(400).json({ message: 'Join request already pending' });
    }

    if (group.isPrivate || group.settings?.requireApproval || group.requireApproval) {
      group.pendingRequests.push({
        userId: userId,
        requestDate: new Date(),
        createdAt: new Date() 
      });

      await group.save();

      console.log('Join request added to pending list');

      res.json({
        message: 'Join request sent successfully',
        status: 'pending',
        groupId: group._id,
        userId: userId
      });

    } else {
      group.members.push({
        userId: userId,
        role: 'member',
        joinedAt: new Date()
      });

      await group.save();

      console.log('User added directly to group (public group)');

      res.json({
        message: 'Joined group successfully',
        status: 'approved',
        groupId: group._id,
        userId: userId
      });
    }

  } catch (error) {
    res.status(500).json({ message: 'Failed to join group' });
  }
});

router.put('/:id/requests/:userId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { action, adminId } = req.body; 
    
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isAdmin = group.members.some(member => 
      member.userId === adminId && member.role === 'admin'
    );
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin privileges required' });
    }

    const { userId } = req.params;
    
    const requestIndex = group.pendingRequests.findIndex(request => request.userId === userId);
    if (requestIndex === -1) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    group.pendingRequests.splice(requestIndex, 1);

    if (action === 'approve') {
      group.members.push({
        userId: userId,
        role: 'member',
        joinedAt: new Date()
      });
    }

    await group.save();
    
    const message = action === 'approve' ? 'User approved successfully' : 'User rejected successfully';
    res.json({ message, action });
  } catch (error) {
    res.status(500).json({ message: 'Failed to handle request' });
  }
});

router.delete('/:groupId/join', async (req, res) => {
  try {
    console.log('Canceling join request for group:', req.params.groupId);
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    console.log('Group found:', group.name);

    const isMember = group.members.some(member => 
      member.userId === userId || member.userId?.toString() === userId?.toString()
    );

    if (isMember) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    const hasPendingRequest = group.pendingRequests.some(request => 
      request.userId === userId || request.userId?.toString() === userId?.toString()
    );

    if (!hasPendingRequest) {
      return res.status(400).json({ message: 'No pending request found for this user' });
    }

    group.pendingRequests = group.pendingRequests.filter(request => 
      request.userId !== userId && request.userId?.toString() !== userId?.toString()
    );

    await group.save();

    console.log('Join request canceled successfully');

    res.json({
      message: 'Join request canceled successfully',
      status: 'canceled',
      groupId: group._id,
      userId: userId
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel join request' });
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const { userId } = req.params;
    console.log('group.creatorId:', group.creatorId);
    console.log('userId:', userId);
    console.log('group.members before:', group.members);
    if (group.creatorId === userId || group.creatorId?.toString() === userId?.toString()) {
      return res.status(400).json({ message: 'Group creator cannot leave the group' });
    }

    group.members = group.members.filter(member => member.userId !== userId && member.userId?.toString() !== userId?.toString());
    await group.save();
    
    res.json({ message: 'Left group successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave group' });
  }
});

router.delete('/:groupId/leave/:userId', async (req, res) => {
  try {
    console.log('User leaving group');

    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid group ID or user ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.creatorId?.toString() === userId) {
      return res.status(400).json({ message: 'Group creator cannot leave the group' });
    }

    const initialCount = group.members.length;
    group.members = group.members.filter(member =>
      member.userId?.toString() !== userId
    );
    
    if (group.members.length === initialCount) {
      return res.status(404).json({ message: 'User not found in group' });
    }

    group.membersCount = group.members.length;
    await group.save();

    console.log('User left group successfully');
    res.json({ message: 'Left group successfully', userId });

  } catch (error) {
    res.status(500).json({ message: 'Failed to leave group' });
  }
});

router.put('/:id', upload.any(), async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const groupId = req.params.id;
    const { 
      name, 
      description, 
      category, 
      rules,
      isPrivate, 
      allowMemberPosts, 
      requireApproval, 
      allowInvites,
      updatedBy 
    } = req.body;

    console.log('Updating group:', groupId);
    console.log('Updated by:', updatedBy);
    console.log('Request body:', req.body);

    const group = await Group.findById(groupId);
    if (!group) {
      console.log('Group not found:', groupId);
      return res.status(404).json({
        message: 'Group not found'
      });
    }

    console.log('Group found:', group.name);

    const isCreator = group.creatorId === updatedBy || group.creatorId?.toString() === updatedBy?.toString();
    const isAdmin = group.members?.some(member => 
      (member.userId === updatedBy || member.userId?.toString() === updatedBy?.toString()) && 
      (member.role === 'admin' || member.role === 'owner')
    );

    console.log('Permission check:', { isCreator, isAdmin, creatorId: group.creatorId, updatedBy });

    if (!isCreator && !isAdmin) {
      console.log('Permission denied');
      return res.status(403).json({
        message: 'Only group admins can update settings'
      });
    }

    console.log('Permission granted');

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (category) group.category = category;
    if (rules !== undefined) group.rules = rules;
    if (isPrivate !== undefined) group.isPrivate = isPrivate === 'true' || isPrivate === true;

    if (!group.settings) group.settings = {};
    
    if (allowMemberPosts !== undefined) {
      group.settings.allowMemberPosts = allowMemberPosts === 'true' || allowMemberPosts === true;
      group.allowMemberPosts = group.settings.allowMemberPosts; 
    }
    
    if (requireApproval !== undefined) {
      const isPrivateGroup = isPrivate === 'true' || isPrivate === true || group.isPrivate;
      const requireApprovalValue = isPrivateGroup ? (requireApproval === 'true' || requireApproval === true) : false;
      group.settings.requireApproval = requireApprovalValue;
      group.requireApproval = requireApprovalValue; 
    }
    
    if (allowInvites !== undefined) {
      group.settings.allowInvites = allowInvites === 'true' || allowInvites === true;
      group.allowInvites = group.settings.allowInvites; 
    }

    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find(file => 
        file.fieldname === 'image' || 
        file.mimetype.startsWith('image/')
      );
      
      if (imageFile) {
        console.log('New image uploaded, converting to base64');
        const base64Image = imageFile.buffer.toString('base64');
        group.image = `data:${imageFile.mimetype};base64,${base64Image}`;
      }
    }

    group.updatedAt = new Date();
    const updatedGroup = await group.save();

    console.log('Group updated successfully');

    res.json({
      message: 'Group updated successfully',
      group: updatedGroup
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      message: 'Failed to update group',
      error: error.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId } = req.body;
    
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.creatorId !== userId) {
      return res.status(403).json({ message: 'Only group creator can delete the group' });
    }

    await GroupPost.deleteMany({ groupId: req.params.id });
    
    await Group.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete group' });
  }
});
///
router.put('/:groupId/transfer-ownership', async (req, res) => {
  console.log(' Transfer ownership called');
  
  try {
    const { groupId } = req.params;
    const { currentOwnerId, newOwnerId } = req.body;

    const Group = (await import('../models/Group.js')).default;
    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    console.log('Group structure:', {
      createdBy: group.createdBy,
      creator: group.creator,
      creatorId: group.creatorId,
      userId: group.userId
    });

    const creatorField = group.createdBy ? 'createdBy' : 
                         group.creator ? 'creator' : 
                         group.creatorId ? 'creatorId' : null;

    if (!creatorField) {
      return res.status(500).json({ success: false, message: 'Creator field not found' });
    }

    group[creatorField] = newOwnerId;
    
  if (group.members && Array.isArray(group.members)) {
  group.members = group.members.map(member => {
    const memberId = (member.userId || member._id || member.id).toString();
    return {
      userId: member.userId,
      role: memberId === newOwnerId ? 'admin' :     
            memberId === currentOwnerId ? 'member' : 
            member.role || 'member',
      joinedAt: member.joinedAt
    };
  });
}

    await group.save();
    
    console.log('Ownership transferred to:', newOwnerId);
    res.json({ success: true, message: 'Ownership transferred successfully' });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


router.get('/:groupId/members', async (req, res) => {
  try {
    console.log('Fetching group with full member details');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const enrichedMembers = await Promise.all(
      group.members.map(async (member) => {
        try {
          const user = await User.findById(member.userId);
          return {
            ...member.toObject(),
            userName: user ? user.fullName : 'Unknown User',
            userEmail: user ? user.email : null,
            userAvatar: user ? user.avatar : null,
            userBio: user ? user.bio : null,
            joinedAt: member.joinedAt || member.createdAt
          };
        } catch (error) {
          return {
            ...member.toObject(),
            userName: 'Unknown User',
            userEmail: null,
            userAvatar: null,
            userBio: null,
            joinedAt: member.joinedAt || member.createdAt
          };
        }
      })
    );

    const sortedMembers = enrichedMembers.sort((a, b) => {
      const roleOrder = { owner: 3, admin: 2, member: 1 };
      const aOrder = roleOrder[a.role] || 1;
      const bOrder = roleOrder[b.role] || 1;
      
      if (aOrder !== bOrder) {
        return bOrder - aOrder; 
      }
      
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    });

    let creatorInfo = {
      creatorName: 'Unknown User',
      creatorAvatar: null
    };

    try {
      const creator = await User.findById(group.creatorId);
        if (creator) {
          creatorInfo = {
            creatorName: creator.fullName || creator.name || 'Unknown User',
            creatorAvatar: creator.avatar || null
          };
        }
    } catch (error) {
    }

    const enrichedGroup = {
      ...group.toObject(),
      members: sortedMembers,
      ...creatorInfo  
    };

    console.log('Group with enriched members fetched successfully');
    res.json(enrichedGroup);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group members' });
  }
});

router.put('/:groupId/members/:memberUserId/role', async (req, res) => {
  try {
    console.log('Updating member role');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, memberUserId } = req.params;
    const { role, adminId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "member" or "admin"' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isCreator = group.creatorId === adminId || group.creatorId?.toString() === adminId?.toString();
    if (!isCreator) {
      return res.status(403).json({ message: 'Only the group creator can change member roles' });
    }

    const memberIndex = group.members.findIndex(member => 
      member.userId === memberUserId || member.userId?.toString() === memberUserId?.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in group' });
    }

    const member = group.members[memberIndex];

    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot change the role of the group creator' });
    }

    group.members[memberIndex].role = role;
    await group.save();

    const user = await User.findById(memberUserId);
    const updatedMember = {
      ...group.members[memberIndex].toObject(),
      userName: user ? user.fullName : 'Unknown User',
      userEmail: user ? user.email : null,
      userAvatar: user ? user.avatar : null
    };

    console.log('Member role updated successfully');
    res.json({ 
      message: `Member role updated to ${role}`,
      member: updatedMember
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to update member role' });
  }
});

router.delete('/:groupId/members/:memberUserId', async (req, res) => {
  try {
    console.log('Removing member from group');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, memberUserId } = req.params;
    const { adminId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !memberUserId || !adminId) {
      return res.status(400).json({ message: 'Invalid group ID, member ID, or admin ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isAdmin = group.members.some(member => 
      (member.userId === adminId || member.userId?.toString() === adminId?.toString()) && 
      (member.role === 'admin' || member.role === 'owner')
    );
    const isCreator = group.creatorId === adminId || group.creatorId?.toString() === adminId?.toString();
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    const memberIndex = group.members.findIndex(member => 
      member.userId === memberUserId || member.userId?.toString() === memberUserId?.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in group' });
    }

    const memberToRemove = group.members[memberIndex];

    if (memberToRemove.role === 'owner' || group.creatorId === memberUserId || group.creatorId?.toString() === memberUserId?.toString()) {
      return res.status(403).json({ message: 'Cannot remove the group creator' });
    }

    if (memberUserId === adminId) {
      return res.status(400).json({ message: 'Use leave group endpoint to remove yourself' });
    }

    const user = await User.findById(memberUserId);
    const memberName = user ? user.fullName : 'Unknown User';

    group.members.splice(memberIndex, 1);
    group.membersCount = group.members.length;
    
    await group.save();

    console.log('Member removed from group successfully');
    res.json({ 
      message: `${memberName} has been removed from the group`,
      removedMemberId: memberUserId,
      removedMemberName: memberName,
      newMembersCount: group.membersCount
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

export default router;