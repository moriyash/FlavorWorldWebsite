import express from 'express';
import mongoose from 'mongoose';
import upload from '../middleware/upload.js';
import { isMongoConnected } from '../config/database.js';
import { createNotification } from '../utils/helpers.js';
import Group from '../models/Group.js';
import GroupPost from '../models/GroupPost.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/:groupId/posts', upload.any(), async (req, res) => {
  try {
    console.log('=== Group Post Creation Debug ===');
    console.log('Group ID:', req.params.groupId);
    console.log('MongoDB connected:', isMongoConnected());
    
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

    const formData = req.body;
    console.log('Group post data received:', formData);

    const userId = formData.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const isMember = group.members.some(member => 
      member.userId === userId || 
      member.userId?.toString() === userId?.toString()
    );
    
    console.log('Membership check:', {
      userId,
      isMember,
      membersCount: group.members.length,
      memberUserIds: group.members.map(m => m.userId)
    });
    
    if (!isMember) {
      console.log('User is not a member');
      return res.status(403).json({ message: 'Only group members can post' });
    }

    const allowMemberPosts = group.settings?.allowMemberPosts ?? group.allowMemberPosts ?? true;
    
    console.log(' Post permission check:', {
      allowMemberPosts,
      hasSettings: !!group.settings,
      settingsAllowMemberPosts: group.settings?.allowMemberPosts,
      directAllowMemberPosts: group.allowMemberPosts
    });

    if (!allowMemberPosts) {
      const isAdmin = group.members.some(member => 
        (member.userId === userId || member.userId?.toString() === userId?.toString()) && 
        (member.role === 'admin' || member.role === 'owner')
      );
      
      const isCreator = group.creatorId === userId || group.creatorId?.toString() === userId?.toString();
      
      console.log('Admin/Creator check:', { isAdmin, isCreator, creatorId: group.creatorId });
      
      if (!isAdmin && !isCreator) {
        console.log('Only admins can post in this group');
        return res.status(403).json({ message: 'Only admins can post in this group' });
      }
    }

    if (!formData.title || formData.title.trim() === '') {
      return res.status(400).json({ message: 'Recipe title is required' });
    }

    let mediaData = null;
    let isVideo = false;
    
    if (req.files && req.files.length > 0) {
      const mediaFile = req.files.find(file => 
        file.fieldname === 'image' || 
        file.fieldname === 'video' ||
        file.mimetype.startsWith('image/') ||
        file.mimetype.startsWith('video/')
      );
      
      if (mediaFile) {
        isVideo = mediaFile.mimetype.startsWith('video/');
        
        if (isVideo && mediaFile.size > 100 * 1024 * 1024) {
          return res.status(400).json({ 
            message: 'Video file too large. Maximum size is 100MB.' 
          });
        }
        
        const base64Data = mediaFile.buffer.toString('base64');
        mediaData = `data:${mediaFile.mimetype};base64,${base64Data}`;
        console.log(`Group post ${isVideo ? 'video' : 'image'} converted to base64`);
      }
    }

    if (!mediaData && formData.image) {
      mediaData = formData.image;
      isVideo = false;
    }
    if (!mediaData && formData.video) {
      mediaData = formData.video;
      isVideo = true;
    }

    const requireApproval = group.settings?.requireApproval ?? group.requireApproval ?? false;
    const isCreator = group.creatorId === userId || group.creatorId?.toString() === userId?.toString();
    const isAdmin = group.members.some(member => 
      (member.userId === userId || member.userId?.toString() === userId?.toString()) && 
      (member.role === 'admin' || member.role === 'owner')
    );

    const autoApprove = !requireApproval || isCreator || isAdmin;

    const postData = {
      title: formData.title.trim(),
      description: formData.description || '',
      ingredients: formData.ingredients || '',
      instructions: formData.instructions || '',
      category: formData.category || 'General',
      meatType: formData.meatType || 'Mixed',
      prepTime: parseInt(formData.prepTime) || 0,
      servings: parseInt(formData.servings) || 1,
      userId: userId,
      groupId: req.params.groupId,
      likes: [],
      comments: [],
      isApproved: autoApprove,
      mediaType: formData.mediaType || 'none'
    };

    if (mediaData) {
      if (isVideo) {
        const videoSizeInBytes = Buffer.byteLength(mediaData, 'utf8');
        const maxMongoDocSize = 15 * 1024 * 1024; 
        
        if (videoSizeInBytes > maxMongoDocSize) {
          return res.status(400).json({ 
            message: 'Video file too large after encoding. Please use a smaller video (max ~10MB original size for 1 minute videos).' 
          });
        }
        
        postData.video = mediaData;
        postData.mediaType = 'video';
        if (formData.videoDuration) {
          postData.videoDuration = parseInt(formData.videoDuration);
        }
      } else {
        postData.image = mediaData;
        postData.mediaType = 'image';
      }
    }

    console.log(' Creating post with approval status:', {
      requireApproval,
      isCreator,
      isAdmin,
      autoApprove,
      finalApprovalStatus: postData.isApproved,
      userId,
      creatorId: group.creatorId
    });

    const groupPost = new GroupPost(postData);
    const savedPost = await groupPost.save();
    
    console.log('Group post saved successfully:', savedPost._id);

    const user = await User.findById(savedPost.userId);
    const enrichedPost = {
      ...savedPost.toObject(),
      userName: user ? user.fullName : 'Unknown User',
      userAvatar: user ? user.avatar : null,
      userBio: user ? user.bio : null,
      postSource: 'group',
      groupName: group.name
    };

    const responseMessage = postData.isApproved 
      ? 'Group post created successfully'
      : 'Group post created and waiting for approval';

    res.status(201).json({
      ...enrichedPost,
      message: responseMessage
    });
    
  } catch (error) {
    console.error(' Error creating group post:', error);
    console.error(' Error name:', error.name);
    console.error(' Error message:', error.message);
    if (error.errors) {
      console.error(' Validation errors:', error.errors);
    }
    res.status(500).json({ 
      message: 'Failed to create group post',
      error: error.message,
      errorType: error.name
    });
  }
});

router.get('/:groupId/posts', async (req, res) => {
  try {
    console.log('GET group posts request:', {
      groupId: req.params.groupId,
      userId: req.query.userId
    });
    
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

    console.log('Group found:', { 
      name: group.name, 
      isPrivate: group.isPrivate,
      membersCount: group.members?.length
    });

    const { userId } = req.query;

    let isMember = false;
    let isAdmin = false;
    let isCreator = false;

    if (userId) {
      isMember = group.members.some(member => 
        member.userId === userId || member.userId?.toString() === userId?.toString()
      );
      
      isAdmin = group.members.some(member => 
        (member.userId === userId || member.userId?.toString() === userId?.toString()) && 
        (member.role === 'admin' || member.role === 'owner')
      );
      
      isCreator = group.creatorId === userId || group.creatorId?.toString() === userId?.toString();
    }

    console.log('User permissions:', { 
      userId, 
      isMember, 
      isAdmin, 
      isCreator,
      isPrivate: group.isPrivate 
    });

    if (group.isPrivate && !isMember) {
      console.log('Access denied to private group, returning empty array');
      return res.json([]);
    }

    let postsQuery = { groupId: req.params.groupId };

    if (isAdmin || isCreator) {
      console.log('Admin/Creator - showing all posts');
    } else if (isMember) {
      postsQuery = {
        groupId: req.params.groupId,
        $or: [
          { isApproved: true },
          { userId: userId, isApproved: false }
        ]
      };
      console.log('Member - showing approved posts + own pending posts');
    } else {
      postsQuery.isApproved = true;
      console.log('Non-member - showing only approved posts');
    }

    const posts = await GroupPost.find(postsQuery).sort({ createdAt: -1 });

    console.log('Posts query result:', {
      totalPosts: posts.length,
      query: postsQuery,
      groupId: req.params.groupId
    });

    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        try {
          const user = await User.findById(post.userId);
          return {
            ...post.toObject(),
            userName: user ? user.fullName : 'Unknown User',
            userAvatar: user ? user.avatar : null,
            userBio: user ? user.bio : null,
            groupName: group.name,
            isPending: !post.isApproved,
            canApprove: (isAdmin || isCreator) && !post.isApproved
          };
        } catch (error) {
          return {
            ...post.toObject(),
            userName: 'Unknown User',
            userAvatar: null,
            userBio: null,
            groupName: group.name,
            isPending: !post.isApproved,
            canApprove: (isAdmin || isCreator) && !post.isApproved
          };
        }
      })
    );

    console.log(`Returning ${enrichedPosts.length} posts for group ${group.name}`);
    res.json(enrichedPosts);
    
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group posts' });
  }
});

router.get('/:groupId/posts/:postId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.groupId !== groupId) {
      return res.status(400).json({ message: 'Post does not belong to this group' });
    }

    const user = await User.findById(post.userId);
    const enrichedPost = {
      ...post.toObject(),
      userName: user ? user.fullName : 'Unknown User',
      userAvatar: user ? user.avatar : null,
      userBio: user ? user.bio : null,
      groupName: group.name
    };

    res.json(enrichedPost);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group post' });
  }
});

router.delete('/:groupId/posts/:postId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const isPostOwner = post.userId === userId;
    const isGroupAdmin = group.members.some(member => 
      member.userId === userId && member.role === 'admin'
    );
    const isGroupCreator = group.creatorId === userId;

    if (!isPostOwner && !isGroupAdmin && !isGroupCreator) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    await GroupPost.findByIdAndDelete(postId);
    res.json({ message: 'Group post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete group post' });
  }
});

router.post('/:groupId/posts/:postId/like', async (req, res) => {
  try {
    console.log('Liking group post...');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = group.members.some(member => member.userId === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Only group members can like posts' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.groupId !== groupId) {
      return res.status(400).json({ message: 'Post does not belong to this group' });
    }

    if (!post.likes) post.likes = [];
    if (post.likes.includes(userId)) {
      return res.status(400).json({ message: 'Already liked this post' });
    }

    post.likes.push(userId);
    await post.save();

    if (post.userId.toString() !== userId) {
      const liker = await User.findById(userId);
      
      await createNotification({
        type: 'like',
        fromUserId: userId,
        toUserId: post.userId,
        postId: post._id,
        groupId: groupId,
        message: `${liker?.fullName || 'Someone'} liked your post in the group`,
        fromUser: {
          name: liker?.fullName || 'Someone',
          avatar: liker?.avatar || null
        }
      }, req.io);
      
      console.log('Group post like notification created');
    }

    console.log('Group post liked successfully');
    res.json({ 
      message: 'Post liked successfully',
      likes: post.likes,
      likesCount: post.likes.length 
    });

  } catch (error) {
    console.error('Error liking group post:', error);
    res.status(500).json({ message: 'Failed to like post' });
  }
});

router.delete('/:groupId/posts/:postId/like', async (req, res) => {
  try {
    console.log('Unliking group post...');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = group.members.some(member => member.userId === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Only group members can unlike posts' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.groupId !== groupId) {
      return res.status(400).json({ message: 'Post does not belong to this group' });
    }

    if (!post.likes || !post.likes.includes(userId)) {
      return res.status(400).json({ message: 'Post not liked yet' });
    }

    post.likes = post.likes.filter(id => id !== userId);
    await post.save();

    console.log('Group post unliked successfully');
    res.json({ 
      message: 'Post unliked successfully',
      likes: post.likes,
      likesCount: post.likes.length 
    });

  } catch (error) {
    console.error('Error unliking group post:', error);
    res.status(500).json({ message: 'Failed to unlike post' });
  }
});

router.post('/:groupId/posts/:postId/comments', async (req, res) => {
  try {
    console.log('Adding comment to group post...');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;
    const { text, userId, userName } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = group.members.some(member => member.userId === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Only group members can comment on posts' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.groupId !== groupId) {
      return res.status(400).json({ message: 'Post does not belong to this group' });
    }

    const user = await User.findById(userId);
    const userAvatar = user?.avatar || null; 

    const newComment = {
      userId: userId,
      userName: userName || user?.fullName || 'Anonymous User',
      userAvatar: userAvatar,
      text: text.trim(),
      createdAt: new Date()
    };

    if (!post.comments) post.comments = [];
    post.comments.push(newComment);
    await post.save();

    const savedComment = post.comments[post.comments.length - 1];

    if (post.userId.toString() !== userId) {
      await createNotification({
        type: 'comment',
        fromUserId: userId,
        toUserId: post.userId,
        postId: post._id,
        groupId: groupId,
        commentId: savedComment._id,
        message: `${userName || user?.fullName || 'Someone'} commented on your post in the group`,
        fromUser: {
          name: userName || user?.fullName || 'Someone',
          avatar: userAvatar
        }
      }, req.io);
      
      console.log('Group post comment notification created');
    }
    
    console.log('Comment added to group post successfully');
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        comment: newComment,
        comments: post.comments,
        commentsCount: post.comments.length
      }
    });

  } catch (error) {
    console.error('Error adding comment to group post:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

router.put('/:groupId/posts/:postId', upload.any(), async (req, res) => {
  try {
    console.log('=== Group Post Update Debug ===');
    console.log('Group ID:', req.params.groupId);
    console.log('Post ID:', req.params.postId);
    console.log('MongoDB connected:', isMongoConnected());
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const userId = req.body.userId;
    const isPostOwner = post.userId === userId || post.userId?.toString() === userId?.toString();
    const isGroupAdmin = group.members.some(member => 
      (member.userId === userId || member.userId?.toString() === userId?.toString()) && 
      (member.role === 'admin' || member.role === 'owner')
    );
    const isGroupCreator = group.creatorId === userId || group.creatorId?.toString() === userId?.toString();

    if (!isPostOwner && !isGroupAdmin && !isGroupCreator) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    const updateData = {
      title: req.body.title || post.title,
      description: req.body.description || post.description,
      ingredients: req.body.ingredients || post.ingredients,
      instructions: req.body.instructions || post.instructions,
      category: req.body.category || post.category,
      meatType: req.body.meatType || post.meatType,
      prepTime: req.body.prepTime ? parseInt(req.body.prepTime) : post.prepTime,
      servings: req.body.servings ? parseInt(req.body.servings) : post.servings
    };

    let mediaData = null;
    let isVideo = false;
    
    if (req.files && req.files.length > 0) {
      const mediaFile = req.files.find(file => 
        file.fieldname === 'image' || 
        file.fieldname === 'video' ||
        file.mimetype.startsWith('image/') ||
        file.mimetype.startsWith('video/')
      );
      
      if (mediaFile) {
        isVideo = mediaFile.mimetype.startsWith('video/');
        
        if (isVideo && mediaFile.size > 100 * 1024 * 1024) {
          return res.status(400).json({ 
            message: 'Video file too large. Maximum size is 100MB.' 
          });
        }
        
        const base64Data = mediaFile.buffer.toString('base64');
        mediaData = `data:${mediaFile.mimetype};base64,${base64Data}`;
        console.log(`${isVideo ? 'Video' : 'Image'} updated to base64`);
      }
    }

    if (mediaData) {
      if (isVideo) {
        const videoSizeInBytes = Buffer.byteLength(mediaData, 'utf8');
        const maxMongoDocSize = 15 * 1024 * 1024; 
        
        if (videoSizeInBytes > maxMongoDocSize) {
          return res.status(400).json({ 
            message: 'Video file too large after encoding. Please use a smaller video (max ~10MB original size).' 
          });
        }
        
        updateData.video = mediaData;
        updateData.mediaType = 'video';
        updateData.image = null; 
        if (req.body.videoDuration) {
          updateData.videoDuration = parseInt(req.body.videoDuration);
        }
      } else {
        updateData.image = mediaData;
        updateData.mediaType = 'image';
        updateData.video = null; 
      }
    } else if (req.body.image) {
      updateData.image = req.body.image;
      updateData.mediaType = 'image';
    } else if (req.body.video) {
      updateData.video = req.body.video;
      updateData.mediaType = 'video';
      if (req.body.videoDuration) {
        updateData.videoDuration = parseInt(req.body.videoDuration);
      }
    } else if (req.body.existingImage) {
      updateData.image = req.body.existingImage;
      updateData.mediaType = 'image';
    } else if (req.body.existingVideo) {
      updateData.video = req.body.existingVideo;
      updateData.mediaType = 'video';
      if (req.body.videoDuration) {
        updateData.videoDuration = parseInt(req.body.videoDuration);
      }
    }

    const updatedPost = await GroupPost.findByIdAndUpdate(
      postId,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('Group post updated successfully:', updatedPost._id);

    const user = await User.findById(updatedPost.userId);
    const enrichedPost = {
      ...updatedPost.toObject(),
      userName: user ? user.fullName : 'Unknown User',
      userAvatar: user ? user.avatar : null,
      userBio: user ? user.bio : null,
      groupName: group.name,
      postSource: 'group'
    };

    res.json({
      message: 'Group post updated successfully',
      recipe: enrichedPost,
      data: enrichedPost
    });

  } catch (error) {
    console.error('Error updating group post:', error);
    res.status(500).json({ message: 'Failed to update group post', error: error.message });
  }
});

router.delete('/:groupId/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    console.log('Deleting comment from group post...');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { groupId, postId, commentId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid group or post ID' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = group.members.some(member => member.userId === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Only group members can delete comments' });
    }

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.groupId !== groupId) {
      return res.status(400).json({ message: 'Post does not belong to this group' });
    }

    const commentIndex = post.comments.findIndex(comment => 
      comment._id.toString() === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const comment = post.comments[commentIndex];

    const isCommentOwner = comment.userId === userId;
    const isGroupAdmin = group.members.some(member => 
      member.userId === userId && member.role === 'admin'
    );
    const isGroupCreator = group.creatorId === userId;

    if (!isCommentOwner && !isGroupAdmin && !isGroupCreator) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    post.comments.splice(commentIndex, 1);
    await post.save();

    console.log('Comment deleted from group post successfully');
    res.json({ 
      message: 'Comment deleted successfully',
      comments: post.comments,
      commentsCount: post.comments.length 
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to delete comment' });
  }
});

export default router;
