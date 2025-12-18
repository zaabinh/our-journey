# Our Journey - Photo Gallery Web Application

A responsive, interactive photo gallery web application that allows users to share and manage memories from their journey together. Built with vanilla HTML, CSS, and JavaScript.

## Features

### 🏠 Home Page
- Welcoming landing page with site branding
- Quick navigation to album and authentication pages
- Responsive design for all device sizes
- Hero section with call-to-action buttons

### 📸 Album Page
- Interactive photo grid gallery with responsive layouts
  - 1 column on mobile, 2 columns on tablet, 3+ columns on desktop
- Photo detail view with image carousel/swiper functionality
- Search and filter functionality (by title, date, location)
- Add, edit, and delete photos (for authenticated users)
- Photo information display (title, date, location, description)
- Drag and drop support for reordering photos

### 👤 User Authentication
- **Sign Up**: Create new account with username, email, and password
  - Username uniqueness validation
  - Email format validation
  - Password strength indicator (weak/medium/strong)
  - Password confirmation matching
  - Real-time validation feedback
- **Login**: Secure login with username and password
  - Client-side validation with error messages
  - Real-time feedback for invalid inputs
- **User Profile**: View and manage user profile information
- **Sign Out**: Logout functionality with session cleanup

### 📱 Responsive Design
- Mobile-first approach with media queries
- Optimized for mobile (<768px), tablet (768-1024px), and desktop (>1024px)
- Touch-friendly interface elements
- No horizontal scrolling on any device

### 💾 Data Management
- Browser-based storage using localStorage
- Photo gallery data persistence
- User authentication data storage (mock/client-side)
- Data backup and recovery functionality

## Project Structure

```
our-journey/
├── README.md                          # Project documentation
├── index.html                         # Home page (entry point)
├── album.html                         # Photo gallery page
├── login_page.html                    # Login page
├── signup_page.html                   # Sign up page
├── profile.html                       # User profile page
├── style_home.css                     # Home page styling
├── style_album.css                    # Album page styling
├── style_login.css                    # Login/signup styling
├── script.js                          # Main application logic
├── auth.js                            # Authentication functions
├── db.js                              # Data management and localStorage
├── assets/
│   ├── icon/                          # Site icons and branding
│   ├── font/                          # Custom fonts
│   └── img/
│       ├── photo_gallery_data.json    # Photo gallery data
│       └── OurJourney/                # Photo assets
├── TODO.md                            # Project tasks summary
└── TODO_detailed.md                   # Detailed task breakdown
```

## Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Edge, Safari)
- No server or build tools required

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd our-journey
   ```

2. Open the application:
   - Navigate to the project directory
   - Open `home.html` (or `index.html`) in your web browser
   - Or use a local server:
     ```bash
     # Using Python
     python -m http.server 8000
     # Then visit http://localhost:8000
     ```

### Usage
1. **Browse Photos**: Navigate to the Album page to view the photo gallery
2. **Search/Filter**: Use the search bar to filter photos by title, date, or location
3. **View Details**: Click on a photo card to view full details and image carousel
4. **Create Account**: Click "Sign Up" to create a new user account
5. **Manage Photos**: After login, add, edit, or delete photos from the gallery
6. **Profile**: Visit your profile page to manage account information

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: CSS Grid, Flexbox, Media Queries
- **Storage**: localStorage (browser-based)
- **Carousel**: Swiper.js (for image navigation)
- **Authentication**: Client-side mock (localStorage-based)

## Features in Development

- [ ] Lazy loading for images (Intersection Observer API)
- [ ] Image pagination/infinite scroll
- [ ] Image compression and optimization
- [ ] Advanced filtering options
- [ ] Export/download photo albums
- [ ] Backend integration for persistent storage
- [ ] Real user authentication (OAuth/JWT)
- [ ] Image upload functionality
- [ ] Comments and ratings on photos
- [ ] Social sharing features

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | Latest  | ✅ Supported |
| Firefox | Latest  | ✅ Supported |
| Safari  | Latest  | ✅ Supported |
| Edge    | Latest  | ✅ Supported |

## Data Structure

### Photo Object
```javascript
{
  id: string,
  title: string,
  date: string (YYYY-MM-DD),
  location: string,
  description: string,
  images: Array<{
    src: string,
    alt: string
  }>,
  updatedAt: number
}
```

### User Object
```javascript
{
  username: string,
  password: string (hashed in production),
  email: string,
  createdAt: number,
  updatedAt: number
}
```

## Important Notes

⚠️ **Security Warning**: The current implementation uses client-side authentication with localStorage. This is suitable for development and learning purposes only. For production:
- Implement proper backend authentication (OAuth, JWT)
- Use secure password hashing (bcrypt, Argon2)
- Use HTTPS and secure cookies
- Implement CSRF protection
- Validate all inputs on the server

## Future Improvements

1. **Backend Integration**
   - Node.js/Express or similar backend framework
   - Database (MongoDB, PostgreSQL, etc.)
   - Real authentication and authorization

2. **Performance**
   - Image optimization and CDN
   - Code splitting and lazy loading
   - Service workers for offline support

3. **Features**
   - Real-time updates with WebSockets
   - Collaborative features
   - Advanced search with AI tagging
   - Mobile app version

## Development

### Adding New Features
1. Create feature branches following git workflow
2. Update TODO.md and TODO_detailed.md
3. Test responsive design across all breakpoints
4. Ensure no console errors or warnings

### Testing
- Use browser DevTools to simulate different device sizes
- Test touch interactions on mobile devices
- Verify form validation and error handling
- Check localStorage data persistence

## Contributing

When contributing:
1. Follow the existing code style
2. Update documentation and TODOs
3. Test responsive design
4. Ensure backward compatibility
5. Add meaningful commit messages

## License

[Add license information here]

## Support

For issues, questions, or suggestions:
- Check existing issues in the repository
- Create a detailed bug report
- Include browser version and device information
- Provide steps to reproduce issues

## Acknowledgments

- Built as part of Full Stack Development Course
- Photo Gallery Project - Front-end Implementation
- Community feedback and contributions

---

**Last Updated**: December 2025
**Status**: Active Development
