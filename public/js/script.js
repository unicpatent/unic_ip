document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            // Only prevent default for internal anchor links
            if (targetId.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(targetId);
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
            // Let external links and other links work normally
        });
    });

    // Add scroll effect to navbar
    const navbar = document.querySelector('.navbar');
    let lastScrollTop = 0;

    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.backdropFilter = 'blur(10px)';
        } else {
            navbar.style.background = '#fff';
            navbar.style.backdropFilter = 'none';
        }

        lastScrollTop = scrollTop;
    });


    // Add hover effects to feature items
    const featureItems = document.querySelectorAll('.feature-item');
    featureItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(10px)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
        });
    });

    // Add click animations to buttons
    const buttons = document.querySelectorAll('.cta-button, .contact-button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Create ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });

    // Add parallax effect to hero section
    const hero = document.querySelector('.hero');
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset;
        const rate = scrollTop * -0.5;
        hero.style.transform = `translateY(${rate}px)`;
    });

    // Animate elements on scroll (Intersection Observer)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-intro, .feature-visual, .mobile-content, .contact-content');
    animateElements.forEach(el => {
        observer.observe(el);
    });

    // Mobile menu toggle (for responsive design)
    const createMobileMenu = () => {
        const nav = document.querySelector('.navbar');
        const menuToggle = document.createElement('div');
        menuToggle.classList.add('mobile-menu-toggle');
        menuToggle.innerHTML = '☰';
        menuToggle.style.display = 'none';
        menuToggle.style.fontSize = '1.5rem';
        menuToggle.style.cursor = 'pointer';
        
        nav.appendChild(menuToggle);
        
        const navMenu = document.querySelector('.nav-menu');
        
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('mobile-active');
        });
        
        // Show/hide mobile menu toggle based on screen size
        const checkScreenSize = () => {
            if (window.innerWidth <= 768) {
                menuToggle.style.display = 'block';
                navMenu.classList.add('mobile-menu');
            } else {
                menuToggle.style.display = 'none';
                navMenu.classList.remove('mobile-menu', 'mobile-active');
            }
        };
        
        window.addEventListener('resize', checkScreenSize);
        checkScreenSize();
    };
    
    createMobileMenu();

    // Add typing animation to hero title
    const heroTitle = document.querySelector('.hero h1');
    const originalText = heroTitle.textContent;
    heroTitle.textContent = '';
    
    let index = 0;
    const typeWriter = () => {
        if (index < originalText.length) {
            heroTitle.textContent += originalText.charAt(index);
            index++;
            setTimeout(typeWriter, 100);
        }
    };
    
    // Start typing animation after a short delay
    setTimeout(typeWriter, 1000);

    // Add loading animation
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });
});

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .animate-in {
        animation: slideInUp 0.8s ease-out;
    }
    
    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .mobile-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        flex-direction: column;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        transform: translateY(-100%);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1000;
    }
    
    .mobile-menu.mobile-active {
        transform: translateY(0);
        opacity: 1;
    }
    
    .mobile-menu li {
        padding: 1rem;
        border-bottom: 1px solid #eee;
    }
    
    .mobile-menu li:last-child {
        border-bottom: none;
    }
    
    body {
        opacity: 0;
        transition: opacity 0.5s ease;
    }
    
    body.loaded {
        opacity: 1;
    }
    
    @media (max-width: 768px) {
        .nav-menu {
            display: flex;
        }
    }
`;

document.head.appendChild(style);