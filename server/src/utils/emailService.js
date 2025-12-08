import emailTransporter from '../config/email.js';

const sendResetEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'FlavorWorld - Password Reset Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #F5A623, #4ECDC4); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;"> FlavorWorld</h1>
        </div>
        
        <div style="padding: 30px; background: #FFF8F0;">
          <h2 style="color: #1F3A93; text-align: center;">Password Reset Code</h2>
          
          <p style="font-size: 16px; color: #2C3E50; line-height: 1.6;">
            Hi there! 
          </p>
          
          <p style="font-size: 16px; color: #2C3E50; line-height: 1.6;">
            We received a request to reset your FlavorWorld password. Use the code below to continue:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: white; border: 3px solid #F5A623; border-radius: 15px; 
                        display: inline-block; padding: 20px 30px; font-size: 32px; 
                        font-weight: bold; color: #1F3A93; letter-spacing: 8px;">
              ${code}
            </div>
          </div>
          
          <p style="font-size: 14px; color: #7F8C8D; text-align: center;">
            This code will expire in 15 minutes for security reasons.
          </p>
          
          <p style="font-size: 16px; color: #2C3E50; line-height: 1.6;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          
          <div style="border-top: 2px solid #E8E8E8; margin-top: 30px; padding-top: 20px; text-align: center;">
            <p style="font-size: 14px; color: #7F8C8D;">
              Happy cooking! <br>
              The FlavorWorld Team
            </p>
          </div>
        </div>
      </div>
    `
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('Reset email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export { sendResetEmail };