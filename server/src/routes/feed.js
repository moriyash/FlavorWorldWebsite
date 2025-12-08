import express from 'express';
import mongoose from 'mongoose';
import { isMongoConnected } from '../config/database.js';
import User from '../models/User.js';
import Recipe from '../models/Recipe.js';
import Group from '../models/Group.js';
import GroupPost from '../models/GroupPost.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('=== Personalized Feed Request ===');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId, type, page = 1, limit = 50 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    console.log('Building personalized feed for user:', userId, 'type:', type, 'page:', page);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const following = (user.following || []).map(f => 
      typeof f === 'string' ? f : f.userId
    );
    console.log('User follows:', following.length, 'people');

    const userGroups = await Group.find({
      $or: [
        { 'members.userId': userId },
        { 'members.userId': userId.toString() }
      ]
    }).select('_id name');
    
    const groupIds = userGroups.map(group => group._id);
    console.log('User is member of:', groupIds.length, 'groups');

    let allPosts = [];
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (type === 'following') {
      console.log('Loading following posts only...');
      
      const followingPosts = await Recipe.find({
        userId: { $in: [...following, userId] }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
      allPosts = followingPosts;
      
    } else if (type === 'groups') {
      console.log('Loading groups posts only...');
      
      const groupPosts = await GroupPost.find({
        groupId: { $in: groupIds },
        isApproved: true
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
      allPosts = groupPosts;
      
    } else {
      console.log('Loading full personalized feed...');

      const followingPosts = await Recipe.find({
        userId: { $in: [...following, userId] }
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2);

      const groupPosts = await GroupPost.find({
        groupId: { $in: groupIds },
        isApproved: true
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2);

      allPosts = [...followingPosts, ...groupPosts];
    }

    const enrichedPosts = await Promise.all(
      allPosts.map(async (post) => {
        try {
          const postUser = await User.findById(post.userId);
          let enrichedPost = {
            ...post.toObject(),
            userName: postUser ? postUser.fullName : 'Unknown User',
            userAvatar: postUser ? postUser.avatar : null,
            userBio: postUser ? postUser.bio : null
          };

          if (post.groupId) {
            const group = userGroups.find(g => g._id.toString() === post.groupId.toString());
            enrichedPost.groupName = group ? group.name : 'Unknown Group';
            enrichedPost.postSource = 'group';
          } else {
            enrichedPost.postSource = 'personal';
          }

          return enrichedPost;
        } catch (error) {
          return {
            ...post.toObject(),
            userName: 'Unknown User',
            userAvatar: null,
            userBio: null,
            postSource: post.groupId ? 'group' : 'personal'
          };
        }
      })
    );

    enrichedPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log(`Returning ${enrichedPosts.length} posts in personalized feed`);
    res.json(enrichedPosts);

  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ message: 'Failed to fetch personalized feed' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId } = req.query;
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Valid user ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const following = user.following || [];
    
    const userGroups = await Group.find({
      $or: [
        { 'members.userId': userId },
        { 'members.userId': userId.toString() }
      ]
    });

    const [followingPostsCount, groupPostsCount, ownPostsCount] = await Promise.all([
      Recipe.countDocuments({ userId: { $in: following } }),
      GroupPost.countDocuments({ 
        groupId: { $in: userGroups.map(g => g._id) }, 
        isApproved: true 
      }),
      Recipe.countDocuments({ userId })
    ]);

    const stats = {
      followingCount: following.length,
      groupsCount: userGroups.length,
      followingPostsCount,
      groupPostsCount,
      ownPostsCount,
      totalFeedPosts: followingPostsCount + groupPostsCount + ownPostsCount
    };

    console.log('Feed stats for user:', userId, stats);
    res.json(stats);

  } catch (error) {
    res.status(500).json({ message: 'Failed to get feed stats' });
  }
});

router.get('/my-posts', async (req, res) => {
  try {
    console.log('=== User Groups Posts Request ===');
    console.log('Groups my-posts request - userId:', req.query.userId);
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    console.log('Getting group posts for user:', userId);

    let userGroups;
    try {
      userGroups = await Group.find({
        $or: [
          { 'members.userId': userId },
          { 'members.userId': userId.toString() }
        ]
      }).select('_id name');
    } catch (error) {
      return res.status(500).json({ message: 'Failed to find user groups' });
    }
    
    console.log('User is member of:', userGroups.length, 'groups');

    if (userGroups.length === 0) {
      console.log('User is not a member of any groups');
      return res.json([]);
    }

    const groupIds = userGroups.map(group => group._id);
    console.log('Group IDs:', groupIds);

    const groupPosts = await GroupPost.find({
      groupId: { $in: groupIds },
      isApproved: true
    }).sort({ createdAt: -1 });

    console.log('Found', groupPosts.length, 'group posts');

    const enrichedPosts = await Promise.all(
      groupPosts.map(async (post) => {
        try {
          const postUser = await User.findById(post.userId);
          const group = userGroups.find(g => g._id.toString() === post.groupId.toString());
          
          return {
            ...post.toObject(),
            userName: postUser ? postUser.fullName : 'Unknown User',
            userAvatar: postUser ? postUser.avatar : null,
            userBio: postUser ? postUser.bio : null,
            groupName: group ? group.name : 'Unknown Group',
            postSource: 'group'
          };
        } catch (error) {
          return {
            ...post.toObject(),
            userName: 'Unknown User',
            userAvatar: null,
            userBio: null,
            groupName: 'Unknown Group',
            postSource: 'group'
          };
        }
      })
    );

    console.log(`Returning ${enrichedPosts.length} group posts`);
    res.json(enrichedPosts);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user groups posts' });
  }
});

router.get('/posts', async (req, res) => {
  try {
    console.log('=== Following Posts Request ===');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    console.log('Getting following posts for user:', userId);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const following = (user.following || []).map(f => 
      typeof f === 'string' ? f : f.userId
    );
    console.log('User follows:', following.length, 'people');

    if (following.length === 0) {
      console.log('User is not following anyone');
      return res.json([]);
    }

    const followingPosts = await Recipe.find({
      userId: { $in: [...following, userId] }
    }).sort({ createdAt: -1 });

    console.log('Found', followingPosts.length, 'following posts');

    const enrichedPosts = await Promise.all(
      followingPosts.map(async (post) => {
        try {
          const postUser = await User.findById(post.userId);
          
          return {
            ...post.toObject(),
            userName: postUser ? postUser.fullName : 'Unknown User',
            userAvatar: postUser ? postUser.avatar : null,
            userBio: postUser ? postUser.bio : null,
            postSource: 'personal'
          };
        } catch (error) {
          return {
            ...post.toObject(),
            userName: 'Unknown User',
            userAvatar: null,
            userBio: null,
            postSource: 'personal'
          };
        }
      })
    );

    console.log(`Returning ${enrichedPosts.length} following posts`);
    res.json(enrichedPosts);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch following posts' });
  }
});

export default router;
