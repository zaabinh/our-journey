// Simple client-side mock auth using localStorage.
// Not secure — replace with real backend later.

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem('users') || '[]');
  } catch (e) { return []; }
}

function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

function findUser(username) {
  const users = loadUsers();
  return users.find(u => u.username === username);
}

function updateUserProfile(username, updates) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex !== -1) {
    users[userIndex] = { ...users[userIndex], ...updates };
    saveUsers(users);
    return true;
  }
  return false;
}

function createUser({username, password, email}) {
  const users = loadUsers();
  if (users.find(u => u.username === username)) throw new Error('Username exists');
  users.push({ username, password, email });
  saveUsers(users);
}

function signIn(username, password) {
  const user = findUser(username);
  if (!user) return { ok:false, message: 'User not found' };
  if (user.password !== password) return { ok:false, message: 'Invalid password' };
  // simulate token
  const token = btoa(username + ':' + Date.now());
  localStorage.setItem('session', JSON.stringify({ username, token }));
  return { ok:true, token };
}

function signOut() {
  localStorage.removeItem('session');
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('session')); } catch (e) { return null; }
}

// Form validation functions
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

function hideError(elementId) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.style.display = 'none';
  }
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function checkPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength <= 2) return 'weak';
  if (strength <= 3) return 'medium';
  return 'strong';
}

function updatePasswordStrength() {
  const password = document.getElementById('signupPassword').value;
  const strengthElement = document.getElementById('passwordStrength');
  if (password.length > 0) {
    const strength = checkPasswordStrength(password);
    strengthElement.textContent = `Password strength: ${strength}`;
    strengthElement.className = `password-strength ${strength}`;
    strengthElement.style.display = 'block';
  } else {
    strengthElement.style.display = 'none';
  }
}

// Wire forms if present
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    // Real-time validation for login
    document.getElementById('loginUsername').addEventListener('input', () => {
      const username = document.getElementById('loginUsername').value.trim();
      if (username.length === 0) {
        showError('usernameError', 'Username is required');
      } else {
        hideError('usernameError');
      }
    });

    document.getElementById('loginPassword').addEventListener('input', () => {
      const password = document.getElementById('loginPassword').value;
      if (password.length === 0) {
        showError('passwordError', 'Password is required');
      } else {
        hideError('passwordError');
      }
    });

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (username.length === 0) {
        showError('usernameError', 'Username is required');
        isValid = false;
      }

      if (password.length === 0) {
        showError('passwordError', 'Password is required');
        isValid = false;
      }

      if (!isValid) return;

      // Show loading state
      const submitBtn = document.getElementById('loginSubmit');
      submitBtn.classList.add('loading');
      submitBtn.textContent = 'Logging in...';

      const res = signIn(username, password);
      if (!res.ok) {
        submitBtn.classList.remove('loading');
        submitBtn.textContent = 'Log in';
        showError('passwordError', res.message);
        return;
      }

      // redirect to next (if provided) or to album page
      try {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next') || 'album.html';
        window.location.href = next;
      } catch (err) {
        window.location.href = 'album.html';
      }
    });
  }

  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    const session = getSession();
    if (session) {
      const user = findUser(session.username);
      if (user) {
        document.getElementById('profileUsername').value = user.username;
        document.getElementById('profileEmail').value = user.email;
        if (user.avatar) {
          document.getElementById('avatarPreview').src = user.avatar;
        }
      }
    }

    document.getElementById('profileAvatar').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('avatarPreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('profileEmail').addEventListener('input', () => {
      const email = document.getElementById('profileEmail').value.trim();
      if (!validateEmail(email)) {
        showError('profileEmailError', 'Please enter a valid email address');
      } else {
        hideError('profileEmailError');
      }
    });

    document.getElementById('profileNewPassword').addEventListener('input', () => {
      const password = document.getElementById('profileNewPassword').value;
      const strengthElement = document.getElementById('profilePasswordStrength');
      if (password.length > 0) {
        const strength = checkPasswordStrength(password);
        strengthElement.textContent = `Password strength: ${strength}`;
        strengthElement.className = `password-strength ${strength}`;
        strengthElement.style.display = 'block';
      } else {
        strengthElement.style.display = 'none';
      }
    });

    document.getElementById('profileConfirmPassword').addEventListener('input', () => {
      const password = document.getElementById('profileNewPassword').value;
      const confirmPassword = document.getElementById('profileConfirmPassword').value;
      if (confirmPassword !== password) {
        showError('profileConfirmPasswordError', 'Passwords do not match');
      } else {
        hideError('profileConfirmPasswordError');
      }
    });

    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      const email = document.getElementById('profileEmail').value.trim();
      const newPassword = document.getElementById('profileNewPassword').value;
      const confirmPassword = document.getElementById('profileConfirmPassword').value;
      const avatarSrc = document.getElementById('avatarPreview').src;

      if (!validateEmail(email)) {
        showError('profileEmailError', 'Please enter a valid email address');
        isValid = false;
      }

      if (newPassword && checkPasswordStrength(newPassword) === 'weak') {
        showError('profileNewPasswordError', 'Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers');
        isValid = false;
      }

      if (newPassword !== confirmPassword) {
        showError('profileConfirmPasswordError', 'Passwords do not match');
        isValid = false;
      }

      if (!isValid) return;

      const updates = { email };
      if (newPassword) updates.password = newPassword;
      if (avatarSrc && avatarSrc !== 'assets/icon/user.png') updates.avatar = avatarSrc;

      if (updateUserProfile(session.username, updates)) {
        alert('Profile updated successfully!');
        window.location.reload();
      } else {
        alert('Failed to update profile.');
      }
    });
  }

  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    // Real-time validation for signup
    document.getElementById('signupUsername').addEventListener('input', () => {
      const username = document.getElementById('signupUsername').value.trim();
      if (username.length < 3) {
        showError('signupUsernameError', 'Username must be at least 3 characters');
      } else {
        hideError('signupUsernameError');
      }
    });

    document.getElementById('signupPassword').addEventListener('input', updatePasswordStrength);

    document.getElementById('signupConfirmPassword').addEventListener('input', () => {
      const password = document.getElementById('signupPassword').value;
      const confirmPassword = document.getElementById('signupConfirmPassword').value;
      if (confirmPassword !== password) {
        showError('signupConfirmPasswordError', 'Passwords do not match');
      } else {
        hideError('signupConfirmPasswordError');
      }
    });

    document.getElementById('signupEmail').addEventListener('input', () => {
      const email = document.getElementById('signupEmail').value.trim();
      if (!validateEmail(email)) {
        showError('signupEmailError', 'Please enter a valid email address');
      } else {
        hideError('signupEmailError');
      }
    });

    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      const username = document.getElementById('signupUsername').value.trim();
      const password = document.getElementById('signupPassword').value;
      const confirmPassword = document.getElementById('signupConfirmPassword').value;
      const email = document.getElementById('signupEmail').value.trim();

      if (username.length < 3) {
        showError('signupUsernameError', 'Username must be at least 3 characters');
        isValid = false;
      }

      const strength = checkPasswordStrength(password);
      if (strength === 'weak') {
        showError('signupPasswordError', 'Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers');
        isValid = false;
      }

      if (password !== confirmPassword) {
        showError('signupConfirmPasswordError', 'Passwords do not match');
        isValid = false;
      }

      if (!validateEmail(email)) {
        showError('signupEmailError', 'Please enter a valid email address');
        isValid = false;
      }

      if (!isValid) return;

      // Show loading state
      const submitBtn = document.getElementById('signupSubmit');
      submitBtn.classList.add('loading');
      submitBtn.textContent = 'Creating account...';

      try {
        createUser({ username, password, email });
        submitBtn.classList.remove('loading');
        submitBtn.textContent = 'Create account';
        alert('Account created. You can now log in.');
        window.location.href = 'login_page.html';
      } catch (err) {
        submitBtn.classList.remove('loading');
        submitBtn.textContent = 'Create account';
        showError('signupUsernameError', err.message || 'Could not create user');
      }
    });
  }
});
