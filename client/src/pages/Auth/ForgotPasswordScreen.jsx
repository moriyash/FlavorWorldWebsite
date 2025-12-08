import React, { useState } from 'react';
import { authService } from '../../services/authService';
import { useNavigate } from 'react-router-dom';
import './ForgotPasswordScreen.css';

const FLAVORWORLD_COLORS = {
  primary: '#F5A623',
  secondary: '#4ECDC4',
  accent: '#1F3A93',
  background: '#FFF8F0',
  white: '#FFFFFF',
  text: '#2C3E50',
  textLight: '#7F8C8D',
  border: '#E8E8E8',
  success: '#27AE60',
  danger: '#E74C3C',
};

export default function ForgotPasswordScreen() {
    const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isFormValid, setIsFormValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(null);

  const handleEmailChange = (e) => {
    const text = e.target.value;
    setEmail(text);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setIsFormValid(emailRegex.test(text));
    
    setEmailExists(null);
  };

  const checkEmailExists = async () => {
    if (!isFormValid) return;

    setIsCheckingEmail(true);
    try {
      const result = await authService.checkEmailExists(email.trim());
      
      if (result.success) {
        setEmailExists(result.exists);
        if (!result.exists) {
          const userResponse = confirm(
            'This email address is not registered. Please check your email or register for a new account.\n\nWould you like to go to the registration page?'
          );
          if (userResponse && navigate) {
            navigate('/register');
          }
        }
      } else {
        alert('Failed to verify email. Please try again.');
      }
    } catch (error) {
      alert('Connection failed. Please try again.');
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleResetPassword = async () => {
    console.log('Reset password button pressed!');
    console.log('Email:', email);

    if (!isFormValid) {
      alert('Please enter a valid email address');
      return;
    }

    if (emailExists === null) {
      await checkEmailExists();
      if (emailExists === false) return; 
    }

    if (emailExists === false) {
      alert('Please enter a registered email address');
      return;
    }

    setIsLoading(true);

    try {
      console.log('Calling authService.sendPasswordResetCode...');
      const result = await authService.sendPasswordResetCode(email.trim());

      console.log('AuthService result:', result);

      if (result.success) {
        console.log('Reset code sent successfully');
        setResetSent(true);
        if (navigate && result.resetToken) {
          navigate('/password-reset-code', {
            state: {
              email: email.trim(),
              resetToken: result.resetToken
            }
          });
        }
      } else {
        console.log('Reset failed:', result.message);
        alert(result.message || 'Failed to send reset code');
      }
    } catch (error) {
      console.error('Reset error:', error);
      alert('Connection failed. Please try again.');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return null; 
    if (isCheckingEmail) return 'Checking Email...';
    if (emailExists === null && isFormValid) return 'Continue';
    if (emailExists === true) return 'Send Reset Code';
    return 'Continue';
  };

  const isButtonDisabled = !isFormValid || isLoading || isCheckingEmail;

  return (
    <div className="forgot-password-screen">
      <div className="container">
        <div className="header">
          <div className="logo-container">
            <div className="logo-background">
              <span className="logo-text">🔐</span>
            </div>
          </div>

          <h1 className="title">Reset Password</h1>
          
          <p className="subtitle">
            {resetSent 
              ? "Password reset instructions sent!" 
              : "Enter your email to receive a reset code"}
          </p>
        </div>

        {!resetSent ? (
          <div className="form">
            <div className="input-group">
              <label className="input-label">Email address</label>
              <div>
                <input
                  type="email"
                  autoComplete="email"
                  onChange={handleEmailChange}
                  placeholder="example@FlavorWorld.com"
                  className={`input-control ${
                    emailExists === true ? 'email-input-valid' : 
                    emailExists === false ? 'email-input-invalid' : ''
                  }`}
                  value={email}
                />
                
                {emailExists === true && (
                  <div className="email-status">
                    <span className="email-status-valid">✓ Email found</span>
                  </div>
                )}
                {emailExists === false && (
                  <div className="email-status">
                    <span className="email-status-invalid">✗ Email not registered</span>
                  </div>
                )}
              </div>
            </div>

            <div className="form-action">
              <button
                onClick={emailExists === null ? checkEmailExists : handleResetPassword}
                disabled={isButtonDisabled}
                className={`btn ${isButtonDisabled ? 'btn-disabled' : ''} ${
                  emailExists === true ? 'btn-ready' : ''
                }`}
              >
                {(isLoading || isCheckingEmail) ? (
                  <div className="spinner">Loading...</div>
                ) : (
                  getButtonText()
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate && navigate('/login')}
              className="form-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="success-container">
            <div className="success-icon">
              <span className="success-emoji">✅</span>
            </div>
            <p className="success-message">
              We've sent a reset code to {email}.
            </p>
            <p className="success-subtext">
              Check your inbox and enter the code in the next screen.
            </p>
            <div className="form-action">
              <button
                onClick={() => navigate && navigate('/login')}
                className="btn"
              >
                Return to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};