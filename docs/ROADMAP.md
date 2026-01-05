# Roadmap

## Status Legend

- Completed
- In Progress
- Planned
- Future Consideration

---

## Core Features

### Load Management
- Load CRUD operations
- Multi-stop support
- Status workflow (Created → Assigned → In Transit → Delivered)
- Load archiving
- CSV export

### Driver Management
- Driver CRM with profiles
- Performance statistics
- Tags and favorites/blocked status
- Driver recommendations for loads

### Tracking
- Real-time GPS pings from drivers
- Public tracking links for customers
- Location history visualization
- Map integration

### Billing
- Stripe integration for credits
- Solana Pay for USDC subscriptions
- Plan limits enforcement
- Usage tracking

---

## In Progress

### Rate Confirmation Attachments
- [ ] End-to-end file upload flow
- [ ] Document viewer in load details
- [ ] Multiple file support
- [ ] File type validation

### Admin Panel Improvements
- [ ] Detailed broker view page
- [ ] Subscription management actions
- [ ] Bulk operations

---

## Planned

### Referral Program
- [ ] Referral code generation
- [ ] Tracking referral signups
- [ ] Reward distribution (credits)
- [ ] Referral dashboard

### Telematics Integration
- [ ] ELD device connections
- [ ] Automatic location updates
- [ ] Hours of Service tracking
- [ ] Vehicle diagnostics

### Enhanced Analytics
- [ ] Custom date ranges
- [ ] Advanced filtering
- [ ] Chart visualizations
- [ ] Scheduled reports

### Notifications
- [ ] SMS alerts (Twilio)
- [ ] Push notifications (PWA)
- [ ] Email digest options
- [ ] In-app notification center

---

## Future Consideration

### Database Scaling
- [ ] PostGIS for geospatial queries
- [ ] Table partitioning for tracking_pings
- [ ] Data archiving strategy
- [ ] Read replicas

### Advanced Features
- [ ] Load board integration
- [ ] Carrier onboarding portal
- [ ] Document OCR
- [ ] Route optimization

### Mobile Apps
- [ ] Native iOS app
- [ ] Native Android app
- [ ] Offline support
- [ ] Background GPS tracking

### Enterprise Features
- [ ] SSO/SAML integration
- [ ] Role-based access control
- [ ] Custom branding
- [ ] API rate tiers

---

## Technical Debt

### Code Quality
- [ ] Increase test coverage
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Component storybook
- [ ] Performance profiling

### Infrastructure
- [ ] CI/CD pipeline improvements
- [ ] Staging environment
- [ ] Monitoring/alerting (DataDog, Sentry)
- [ ] Load testing

---

## Completed Milestones

### v1.0 - MVP
- Basic load management
- Driver token access
- Public tracking links
- Stripe billing

### v1.1 - Analytics
- Analytics dashboard
- CO2 emissions tracking
- Performance metrics
- CSV export

### v1.2 - Exceptions & Webhooks
- Exception monitoring (Late, No Signal, Long Dwell)
- Webhook integrations
- Notification preferences

### v1.3 - Driver CRM
- Full driver management
- Performance statistics
- Driver recommendations

### v1.4 - Rewards
- Driver loyalty points
- Tap-to-earn mechanics
- Point tracking

---

## Contributing

To propose new features:

1. Open an issue with `[Feature Request]` prefix
2. Describe the use case
3. Discuss implementation approach
4. Submit PR if approved

Priority is given to features that:
- Benefit multiple users
- Align with product vision
- Have clear implementation path
- Include tests
