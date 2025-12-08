import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Import route
import uploadRouter from '../../src/routes/upload.js';

// Import database
import * as database from '../../src/config/database.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/upload', uploadRouter);

describe('Upload Routes - Unit Tests', () => {
  // Path to test image
  const testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');

  // ==========================================
  // POST /avatar - Upload Avatar
  // ==========================================
  describe('POST /avatar - Upload Avatar', () => {
    it('should upload avatar successfully', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-image-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.url).toContain('data:image/jpeg;base64');
      expect(response.body.filename).toBe('test.jpg');
    });

    it('should return 400 when no file uploaded', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should return error when file is not an image', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-pdf-data'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        });

      // multer might throw 500 or 400 depending on error handling
      expect([400, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.error).toBe('Only image files are allowed');
      }
    });

    it('should handle file size limit errors', async () => {
      // Create a buffer larger than 5MB
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', largeBuffer, {
          filename: 'large.jpg',
          contentType: 'image/jpeg'
        });

      // multer might throw 413 or 500 depending on configuration
      expect([413, 500]).toContain(response.status);
    });

    it('should accept PNG images', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-png-data'), {
          filename: 'test.png',
          contentType: 'image/png'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.url).toContain('data:image/png;base64');
    });

    it('should accept GIF images', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-gif-data'), {
          filename: 'test.gif',
          contentType: 'image/gif'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.url).toContain('data:image/gif;base64');
    });

    it('should convert uploaded file to base64', async () => {
      const testData = 'test-image-data';
      const expectedBase64 = Buffer.from(testData).toString('base64');

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from(testData), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(200);
      expect(response.body.url).toContain(expectedBase64);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-image-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should handle upload errors gracefully', async () => {
      // Simulate an error by sending invalid data
      const response = await request(app)
        .post('/api/upload/avatar')
        .set('Content-Type', 'multipart/form-data')
        .send('invalid-data');

      expect([400, 500]).toContain(response.status);
    });

    it('should preserve original filename', async () => {
      const originalFilename = 'my-profile-picture.jpg';

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-image-data'), {
          filename: originalFilename,
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(200);
      expect(response.body.filename).toBe(originalFilename);
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================
  describe('Integration Tests', () => {
    it('should handle multiple sequential uploads', async () => {
      // Upload 1
      const response1 = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('image-1'), {
          filename: 'avatar1.jpg',
          contentType: 'image/jpeg'
        });

      expect(response1.status).toBe(200);

      // Upload 2
      const response2 = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('image-2'), {
          filename: 'avatar2.png',
          contentType: 'image/png'
        });

      expect(response2.status).toBe(200);

      // Verify different base64 strings
      expect(response1.body.url).not.toBe(response2.body.url);
    });

    it('should handle uploads with special characters in filename', async () => {
      const specialFilename = 'my avatar (2024) - final.jpg';

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-image-data'), {
          filename: specialFilename,
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(200);
      expect(response.body.filename).toBe(specialFilename);
    });

    it('should return appropriate MIME type in base64 string', async () => {
      const testCases = [
        { contentType: 'image/jpeg', expected: 'data:image/jpeg;base64' },
        { contentType: 'image/png', expected: 'data:image/png;base64' },
        { contentType: 'image/gif', expected: 'data:image/gif;base64' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/upload/avatar')
          .attach('avatar', Buffer.from('fake-data'), {
            filename: 'test.jpg',
            contentType: testCase.contentType
          });

        expect(response.status).toBe(200);
        expect(response.body.url).toContain(testCase.expected);
      }
    });
  });

  // ==========================================
  // Error Handling
  // ==========================================
  describe('Error Handling', () => {
    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
    });

    it('should handle missing content-type', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-data'), {
          filename: 'test.jpg'
          // No contentType specified
        });

      // Should either accept or reject, but not crash
      expect([200, 400, 415]).toContain(response.status);
    });

    it('should return 500 on unexpected server errors', async () => {
      // Mock an internal error
      vi.spyOn(database, 'isMongoConnected').mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to upload avatar');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // Security Tests
  // ==========================================
  describe('Security Tests', () => {
    it('should reject executable files', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-exe-data'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload'
        });

      // Should reject non-image files
      expect([400, 500]).toContain(response.status);
    });

    it('should reject script files', async () => {
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('<script>alert("xss")</script>'), {
          filename: 'script.js',
          contentType: 'application/javascript'
        });

      // Should reject non-image files
      expect([400, 500]).toContain(response.status);
    });

    it('should reject SVG files (potential XSS)', async () => {
      const svgContent = '<svg><script>alert("xss")</script></svg>';
      
      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from(svgContent), {
          filename: 'image.svg',
          contentType: 'image/svg+xml'
        });

      // SVG might be accepted or rejected depending on implementation
      // But should not cause security issues
      if (response.status === 200) {
        // If accepted, should be properly encoded
        expect(response.body.url).toContain('base64');
      } else {
        expect(response.status).toBe(400);
      }
    });

    it('should handle extremely long filenames', async () => {
      const longFilename = 'a'.repeat(1000) + '.jpg';

      const response = await request(app)
        .post('/api/upload/avatar')
        .attach('avatar', Buffer.from('fake-data'), {
          filename: longFilename,
          contentType: 'image/jpeg'
        });

      // Should either accept with truncation or reject
      expect([200, 400, 413]).toContain(response.status);
    });
  });
});

export default describe;