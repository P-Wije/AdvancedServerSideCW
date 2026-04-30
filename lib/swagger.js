const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Alumni Influencers API',
    version: '1.0.0',
    description: 'Secure relational API for the University of Eastminster Alumni Influencers marketplace.',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Service health and bootstrap endpoints' },
    { name: 'Authentication', description: 'Registration, verification, login, logout, and password reset' },
    { name: 'Profile', description: 'Authenticated alumni profile management' },
    { name: 'Bidding', description: 'Blind bidding and monthly allowance management' },
    { name: 'Developer Management', description: 'Private developer API key management and usage statistics' },
    { name: 'Public Developer API', description: 'Bearer-token protected client-facing endpoints (read:alumni_of_day)' },
    { name: 'Analytics', description: 'Bearer-token analytics endpoints used by the University Analytics Dashboard (read:analytics)' },
    { name: 'Alumni Directory', description: 'Bearer-token directory listings (read:alumni)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
      },
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
      },
    },
    schemas: {
      MessageResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      SessionResponse: {
        type: 'object',
        properties: {
          authenticated: { type: 'boolean' },
          csrfToken: { type: 'string' },
          user: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'integer' },
              email: { type: 'string' },
              verified: { type: 'boolean' },
              lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
              profileComplete: { type: 'boolean' },
            },
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'graduate@eastminster.ac.uk' },
          password: { type: 'string', example: 'StrongPass!234' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'graduate@eastminster.ac.uk' },
          password: { type: 'string', example: 'StrongPass!234' },
        },
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', example: 'graduate@eastminster.ac.uk' },
        },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', example: 'StrongerPass!345' },
        },
      },
      EventParticipationRequest: {
        type: 'object',
        required: ['eventName', 'participatedOn'],
        properties: {
          eventName: { type: 'string', example: 'Eastminster Alumni Futures Night' },
          participatedOn: { type: 'string', format: 'date', example: '2026-04-01' },
        },
      },
      BidRequest: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number', example: 250 },
        },
      },
      Achievement: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          referenceUrl: { type: 'string', format: 'uri' },
          completionDate: { type: 'string', format: 'date' },
        },
      },
      EmploymentRecord: {
        type: 'object',
        properties: {
          employer: { type: 'string' },
          jobTitle: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', nullable: true },
        },
      },
      Profile: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          biography: { type: 'string' },
          linkedinUrl: { type: 'string', format: 'uri' },
          profileImagePath: { type: 'string', nullable: true },
          degrees: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } },
          certifications: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } },
          licences: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } },
          courses: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } },
          employmentHistory: { type: 'array', items: { $ref: '#/components/schemas/EmploymentRecord' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProfileResponse: {
        type: 'object',
        properties: {
          profile: {
            oneOf: [
              { $ref: '#/components/schemas/Profile' },
              { type: 'null' },
            ],
          },
        },
      },
      BidHistoryEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          targetDate: { type: 'string', format: 'date' },
          amount: { type: 'number' },
          status: { type: 'string', enum: ['active', 'scheduled', 'won', 'lost', 'cancelled'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      BiddingOverview: {
        type: 'object',
        properties: {
          targetDate: { type: 'string', format: 'date' },
          biddingOpen: { type: 'boolean' },
          blindStatus: {
            type: 'object',
            properties: {
              hasBid: { type: 'boolean' },
              isWinning: { type: 'boolean' },
              currentBidAmount: { type: 'number', nullable: true },
              status: { type: 'string' },
              feedback: { type: 'string', enum: ['winning', 'not-winning', 'no-active-bid'] },
            },
          },
          monthlyAllowance: {
            type: 'object',
            properties: {
              month: { type: 'string', example: '2026-04' },
              wins: { type: 'integer' },
              maxWins: { type: 'integer' },
              remaining: { type: 'integer' },
              hasBonus: { type: 'boolean' },
            },
          },
          history: {
            type: 'array',
            items: { $ref: '#/components/schemas/BidHistoryEntry' },
          },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          tokenPrefix: { type: 'string' },
          scopes: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          revokedAt: { type: 'string', format: 'date-time', nullable: true },
          usageCount: { type: 'integer' },
        },
      },
      ApiKeyUsageEntry: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          httpMethod: { type: 'string' },
          ipAddress: { type: 'string', nullable: true },
          userAgent: { type: 'string', nullable: true },
          responseStatus: { type: 'integer', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateApiKeyRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'AR Client Local Key' },
        },
      },
      FeaturedAlumnus: {
        type: 'object',
        properties: {
          featuredDate: { type: 'string', format: 'date' },
          bidAmount: { type: 'number', example: 250 },
          alumnus: {
            type: 'object',
            properties: {
              email: { type: 'string', example: 'grad2020@eastminster.ac.uk' },
              profile: { $ref: '#/components/schemas/Profile' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service is running',
          },
        },
      },
    },
    '/auth/session': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current session state and CSRF token',
        responses: {
          200: {
            description: 'Session details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SessionResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new alumni account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Account created and verification email sent',
          },
        },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Authentication'],
        summary: 'Resend verification email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForgotPasswordRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Verification email resend handled' },
        },
      },
    },
    '/auth/verify-email': {
      get: {
        tags: ['Authentication'],
        summary: 'Verify email with token',
        parameters: [
          {
            in: 'query',
            name: 'token',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Email verified' },
          400: { description: 'Token invalid or expired' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' },
          403: { description: 'Email not verified' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout current session',
        security: [{ sessionAuth: [] }],
        responses: {
          200: { description: 'Logged out successfully' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Start password reset flow',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForgotPasswordRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Reset flow initiated' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Complete password reset',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResetPasswordRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Password updated' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/profile/me': {
      get: {
        tags: ['Profile'],
        summary: 'Get the signed-in user profile',
        security: [{ sessionAuth: [] }],
        responses: {
          200: {
            description: 'Profile details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileResponse' },
              },
            },
          },
          401: { description: 'Authentication required' },
          403: { description: 'Email verification required' },
        },
      },
      post: {
        tags: ['Profile'],
        summary: 'Create or update the signed-in user profile',
        description: 'Send as multipart/form-data. Repeatable list fields are JSON strings.',
        security: [{ sessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['firstName', 'lastName', 'biography', 'linkedinUrl'],
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  biography: { type: 'string' },
                  linkedinUrl: { type: 'string', format: 'uri' },
                  profileImage: { type: 'string', format: 'binary' },
                  degrees: { type: 'string', example: '[{"title":"BSc Computer Science","referenceUrl":"https://eastminster.ac.uk/degrees/computer-science","completionDate":"2023-06-01"}]' },
                  certifications: { type: 'string' },
                  licences: { type: 'string' },
                  courses: { type: 'string' },
                  employmentHistory: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile saved' },
          422: { description: 'Validation failed' },
        },
      },
    },
    '/bids/overview': {
      get: {
        tags: ['Bidding'],
        summary: 'Get blind bidding overview for tomorrow',
        security: [{ sessionAuth: [] }],
        responses: {
          200: {
            description: 'Bidding dashboard payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BiddingOverview' },
              },
            },
          },
        },
      },
    },
    '/bids/history': {
      get: {
        tags: ['Bidding'],
        summary: 'Get bid history for the signed-in alumnus',
        security: [{ sessionAuth: [] }],
        responses: {
          200: {
            description: 'Bid history entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    bids: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/BidHistoryEntry' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/bids': {
      post: {
        tags: ['Bidding'],
        summary: 'Place a new blind bid or increase an existing one',
        security: [{ sessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BidRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Bid increased' },
          201: { description: 'Bid created' },
          400: { description: 'Bid closed or invalid' },
          409: { description: 'Bid can no longer be changed' },
        },
      },
    },
    '/bids/{id}': {
      delete: {
        tags: ['Bidding'],
        summary: 'Cancel an active bid before the 6 PM cut-off',
        security: [{ sessionAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: 'Bid cancelled' },
          404: { description: 'Bid not found' },
        },
      },
    },
    '/events/participation': {
      post: {
        tags: ['Bidding'],
        summary: 'Register alumni event participation to unlock the monthly 4th slot',
        security: [{ sessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EventParticipationRequest' },
            },
          },
        },
        responses: {
          201: { description: 'Event participation recorded' },
        },
      },
    },
    '/developer/api-keys': {
      get: {
        tags: ['Developer Management'],
        summary: 'List API keys created by the signed-in alumnus',
        security: [{ sessionAuth: [] }],
        responses: {
          200: {
            description: 'API keys',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKeys: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ApiKey' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Developer Management'],
        summary: 'Create a new scoped API key',
        security: [{ sessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiKeyRequest' },
            },
          },
        },
        responses: {
          201: { description: 'API key created' },
        },
      },
    },
    '/developer/api-keys/{id}/usage': {
      get: {
        tags: ['Developer Management'],
        summary: 'View usage logs for a specific API key',
        security: [{ sessionAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            description: 'API key usage log',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKey: { $ref: '#/components/schemas/ApiKey' },
                    usage: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ApiKeyUsageEntry' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/developer/api-keys/{id}': {
      delete: {
        tags: ['Developer Management'],
        summary: 'Revoke an API key',
        security: [{ sessionAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: 'API key revoked' },
          404: { description: 'API key not found' },
        },
      },
    },
    '/api/public/featured/today': {
      get: {
        tags: ['Public Developer API'],
        summary: 'Get today\'s featured alumnus',
        description: 'Requires `read:alumni_of_day` scope on the bearer token (granted by the `ar_app` preset).',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Featured alumnus payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FeaturedAlumnus' },
              },
            },
          },
          401: { description: 'Bearer token missing or invalid' },
          403: { description: 'Token missing read:alumni_of_day scope' },
          404: { description: 'No featured alumnus is active today' },
        },
      },
    },
    '/api/analytics/summary': {
      get: {
        tags: ['Analytics'],
        summary: 'Headline KPIs for the dashboard hub',
        description: 'Requires `read:analytics` scope.',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams(),
        responses: {
          200: { description: 'Summary metrics' },
          403: { description: 'Token missing read:analytics scope' },
        },
      },
    },
    '/api/analytics/employment-by-sector': {
      get: {
        tags: ['Analytics'],
        summary: 'Distribution of currently employed alumni by industry sector',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {label, value}' }, 403: { description: 'Missing scope' } },
      },
    },
    '/api/analytics/job-titles': {
      get: {
        tags: ['Analytics'],
        summary: 'Top current job titles',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ limit: true, csv: true }),
        responses: { 200: { description: 'Rows of {label, value}' } },
      },
    },
    '/api/analytics/top-employers': {
      get: {
        tags: ['Analytics'],
        summary: 'Top employers by alumni count',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ limit: true, csv: true }),
        responses: { 200: { description: 'Rows of {label, value}' } },
      },
    },
    '/api/analytics/geographic': {
      get: {
        tags: ['Analytics'],
        summary: 'Geographic distribution by country of current employment',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {label, value}' } },
      },
    },
    '/api/analytics/skills-gap': {
      get: {
        tags: ['Analytics'],
        summary: 'Programme x sector cross-tab',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {programme, sector, value}' } },
      },
    },
    '/api/analytics/professional-development': {
      get: {
        tags: ['Analytics'],
        summary: 'Non-degree achievements completed per year, by type',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {year, type, value}' } },
      },
    },
    '/api/analytics/curriculum-coverage': {
      get: {
        tags: ['Analytics'],
        summary: 'Per-programme coverage of competency keyword buckets',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {programme, total, scores}' } },
      },
    },
    '/api/analytics/cohort-trend': {
      get: {
        tags: ['Analytics'],
        summary: 'Alumni count by graduation year',
        security: [{ bearerAuth: [] }],
        parameters: analyticsFilterParams({ csv: true }),
        responses: { 200: { description: 'Rows of {year, value}' } },
      },
    },
    '/api/alumni': {
      get: {
        tags: ['Alumni Directory'],
        summary: 'Filtered alumni directory listing (paginated)',
        description: 'Requires `read:alumni` scope. Returns name, programme, graduation date, current employer/job title, sector, and location.',
        security: [{ bearerAuth: [] }],
        parameters: [
          ...analyticsFilterParams({ csv: true }),
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'pageSize', schema: { type: 'integer', default: 20, maximum: 50 } },
        ],
        responses: {
          200: { description: 'Paginated rows' },
          403: { description: 'Token missing read:alumni scope' },
        },
      },
    },
  },
};

/**
 * Builds the standard filter parameter list reused by every analytics path.
 */
function analyticsFilterParams(opts = {}) {
  const base = [
    { in: 'query', name: 'programme', schema: { type: 'string' } },
    { in: 'query', name: 'graduationFrom', schema: { type: 'string', format: 'date' } },
    { in: 'query', name: 'graduationTo', schema: { type: 'string', format: 'date' } },
    { in: 'query', name: 'sector', schema: { type: 'string' } },
    { in: 'query', name: 'country', schema: { type: 'string' } },
  ];
  if (opts.limit) {
    base.push({ in: 'query', name: 'limit', schema: { type: 'integer', default: 10, maximum: 50 } });
  }
  if (opts.csv) {
    base.push({ in: 'query', name: 'format', schema: { type: 'string', enum: ['json', 'csv'] }, description: 'Use `csv` to stream a comma-separated download.' });
  }
  return base;
}

const specs = swaggerJsdoc({ definition, apis: [] });

module.exports = {
  specs,
  swaggerUi,
};
