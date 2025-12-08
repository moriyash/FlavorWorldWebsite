import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RegisterScreen.css';
import { authService } from '../../services/authService';

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

export default function RegisterScreen() {
    const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateFullName = (name) => {
    if (!name || name.trim() === '') return 'Please enter your full name';
    if (name.trim().length < 3) return 'Name must be at least 3 characters';
    return '';
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || email.trim() === '') return 'Please enter an email address';
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const validatePassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/;

    if (!password || password.trim() === '') return 'Please enter a password';
    if (!passwordRegex.test(password)) {
      return 'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character';
    }
    return '';
  };

  const validateConfirmPassword = (password, confirmPassword) => {
    if (!confirmPassword || confirmPassword.trim() === '') return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const validateForm = () => {
    const newErrors = {
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword: validateConfirmPassword(form.password, form.confirmPassword),
    };

    setErrors(newErrors);

    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleInputChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const handleFullNameChange = (e) => {
    handleInputChange('fullName', e.target.value);
  };

  const handleEmailChange = (e) => {
    handleInputChange('email', e.target.value);
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    handleInputChange('password', value);
    if (form.confirmPassword) {
      setErrors({
        ...errors,
        confirmPassword: validateConfirmPassword(value, form.confirmPassword),
      });
    }
  };

  const handleConfirmPasswordChange = (e) => {
    handleInputChange('confirmPassword', e.target.value);
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const toggleConfirmPasswordVisibility = () => {
    setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
  };

  const handleRegister = async () => {
    console.log('Register button pressed!');
    console.log('Form data:', form);

    if (!validateForm()) {
      console.log('Form validation failed');
      alert('Please fill in all fields correctly.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('Calling authService.register...');
      const result = await authService.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword
      });

      console.log('AuthService result:', result);

      if (result.success) {
        console.log('Registration successful');
        alert('Welcome to FlavorWorld! Registration completed successfully!');
        if (navigate) {
          navigate('/login');
        }
      } else {
        console.log('Registration failed:', result.message);
        alert(`Registration Failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Error: Connection failed. Please try again.');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  return (
    <div className="register-screen">
      <div className="container">
        <div className="header">
          <div className="logo-container">
            <div className="logo-background">
              <span className="logo-text">👨‍🍳</span>
            </div>
          </div>

          <h1 className="title">Join <span className="title-highlight">FlavorWorld</span></h1>
          <p className="subtitle">
            Create your account and start sharing delicious recipes
          </p>
        </div>

        <div className="form">
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <div>
              <input
                type="text"
                autoComplete="name"
                onChange={handleFullNameChange}
                placeholder="Chef's Name"
                className={`input-control ${errors.fullName ? 'input-error' : ''}`}
                value={form.fullName}
              />
              {errors.fullName && <span className="error-text">{errors.fullName}</span>}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Email address</label>
            <div>
              <input
                type="email"
                autoComplete="email"
                onChange={handleEmailChange}
                placeholder="chef@FlavorWorld.com"
                className={`input-control ${errors.email ? 'input-error' : ''}`}
                value={form.email}
              />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div>
              <div className="password-container">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  onChange={handlePasswordChange}
                  placeholder="Create a strong password"
                  className={`input-control password-input ${errors.password ? 'input-error' : ''}`}
                  value={form.password}
                />
                <button 
                  type="button"
                  className="visibility-icon" 
                  onClick={togglePasswordVisibility}
                >
                  <span className="eye-icon">
                    {isPasswordVisible ? '👁️' : '👁️‍🗨️'}
                  </span>
                </button>
              </div>
              {errors.password && <span className="error-text">{errors.password}</span>}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <div>
              <div className="password-container">
                <input
                  type={isConfirmPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  onChange={handleConfirmPasswordChange}
                  placeholder="Confirm your password"
                  className={`input-control password-input ${errors.confirmPassword ? 'input-error' : ''}`}
                  value={form.confirmPassword}
                />
                <button 
                  type="button"
                  className="visibility-icon" 
                  onClick={toggleConfirmPasswordVisibility}
                >
                  <span className="eye-icon">
                    {isConfirmPasswordVisible ? '👁️' : '👁️‍🗨️'}
                  </span>
                </button>
              </div>
              {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
            </div>
          </div>

          <div className="form-action">
            <button 
              onClick={handleRegister}
              disabled={isLoading}
              className={`btn ${isLoading ? 'btn-disabled' : ''}`}
            >
              {isLoading ? (
                <div className="spinner">Loading...</div>
              ) : (
                'Join the Community'
              )}
            </button>
          </div>

          <div className="terms-container">
            <p className="terms-text">
              By creating an account, you agree to our{' '}
              <a href="#" className="terms-link">Terms of Service</a> and{' '}
              <a href="#" className="terms-link">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="form-footer-button"
        onClick={() => navigate && navigate('/login')}
      >
        <p className="form-footer">
          Already have an account?{' '}
          <span className="form-footer-link">Sign in to FlavorWorld</span>
        </p>
      </button>
    </div>
  );
};
