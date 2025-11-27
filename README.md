# Box to Cloud

A serverless document retention review application built on AWS Amplify Gen2 with Next.js 15.

## Overview

DocSense Cloud enables AOAO (condo association) board members to review scanned document pages and mark them for retention or destruction. The application is designed for simplicity, low cost, and ease of use.

### Features

- **Page-by-Page Review**: Review scanned document pages one at a time
- **Decision Tracking**: Mark pages as Shred, Unsure, or Retain
- **Progress Dashboard**: Track overall review progress across all boxes
- **Box Management**: View status and recommendations for each document box
- **Multi-User Support**: Queue-based assignment prevents duplicate reviews
- **Keyboard Shortcuts**: Fast review with keyboard shortcuts (1/S, 2/U, 3/R)

### Technology Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript
- **Backend**: AWS Amplify Gen2 (AppSync GraphQL, DynamoDB, Cognito)
- **Hosting**: AWS Amplify Hosting
- **Authentication**: Amazon Cognito

## Getting Started

### Prerequisites

- Node.js 20 or later
- An AWS account with Amplify configured
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd box-to-cloud
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deployment

This application is designed to be deployed via AWS Amplify. Connect your repository to Amplify Console and deployments will be automatic on push to the main branch.

For detailed deployment instructions, see the [AWS Amplify Documentation](https://docs.amplify.aws/nextjs/start/quickstart/).

## Architecture

```
Frontend (Next.js App Router)
    |
    v
AWS Amplify Auth (Cognito)
    |
    v
AWS AppSync (GraphQL API)
    |
    v
Amazon DynamoDB (Single Table Design)
    |
    v
Amazon S3 (Page Images - via presigned URLs)
```

### Data Model

- **Box**: Physical box of scanned documents
- **Document**: Single PDF file within a box
- **Page**: Individual page within a document (primary review entity)
- **UserReview**: Audit trail of review decisions

## Usage

### Review Workflow

1. Log in with your credentials
2. The Review page shows the next pending page
3. View the document page image
4. Make a decision:
   - **Shred (1 or S)**: Document can be destroyed
   - **Unsure (2 or U)**: Needs further review
   - **Retain (3 or R)**: Must be kept
5. The next page loads automatically

### Progress Tracking

- View overall progress on the Progress page
- Track individual box status on the Boxes page
- Completed boxes show recommendations:
  - **Safe to Shred**: All pages marked as shred
  - **Retain**: Contains pages marked for retention
  - **Needs Review**: Contains unsure pages

## Development

### Project Structure

```
app/
  components/       # React components
  types/           # TypeScript type definitions
  progress/        # Progress page route
  boxes/           # Boxes page route
  page.tsx         # Main review page
  layout.tsx       # Root layout
amplify/
  auth/            # Cognito configuration
  data/            # DynamoDB schema
  backend.ts       # Backend definition
```

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Related Documentation

See [CLOUD_MIGRATION_SPEC.md](./CLOUD_MIGRATION_SPEC.md) for the complete technical specification, including:
- Detailed DynamoDB schema
- API endpoints
- Data migration scripts
- Cost estimates

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
