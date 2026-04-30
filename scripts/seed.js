/* eslint-disable no-console */
/**
 * Populates a fresh database with realistic alumni so the analytics dashboard
 * has data to display during demos.
 *
 * Usage:
 *   npm run seed -- --force      # wipes existing data and reseeds
 *   npm run seed                 # refuses to run if any users already exist
 *
 * Prints two reference accounts and two API tokens to stdout once finished.
 */
const db = require('../db');
const config = require('../lib/config');
const { hashPassword } = require('../lib/security');
const { createOpaqueTokenPair } = require('../lib/security');
const { CLIENT_PRESETS, serializeScopes } = require('../lib/scopes');

const force = process.argv.includes('--force');
const EMAIL_DOMAIN = config.universityEmailDomain;

const PROGRAMMES = [
  { name: 'BSc Computer Science', weight: 14 },
  { name: 'BSc Information Technology', weight: 12 },
  { name: 'BSc Business Management', weight: 10 },
  { name: 'BA Media & Communications', weight: 6 },
  { name: 'BSc Data Analytics', weight: 5 },
  { name: 'BSc Cybersecurity', weight: 3 },
];

const SECTORS = [
  'Technology', 'Finance', 'Healthcare', 'Education',
  'Government', 'Media', 'Retail', 'Energy',
];

const EMPLOYERS_DOMINANT = ['Phantasmagoria Ltd', 'Albion Bank', 'NHS Digital', 'Eastminster City Council'];
const EMPLOYERS_LONG_TAIL = [
  'Lumen Industries', 'Brightline Health', 'Heron Analytics', 'Westgate Energy',
  'PrismMedia Group', 'NorthStar Retail', 'Helix Robotics', 'Crowne Logistics',
  'Atlas Cloud', 'BlueRiver Insurance', 'Greenfield Pharma', 'Sterling Aviation',
  'Silverwood Education', 'Kestrel Cyber', 'Maple Software', 'Quantum Capital',
  'Pinnacle Telecom', 'Vega Bioscience', 'Halcyon Studios', 'Ironclad Security',
];

const JOB_TITLES_BY_SECTOR = {
  Technology: ['Software Engineer', 'DevOps Engineer', 'Engineering Manager', 'Site Reliability Engineer'],
  Finance: ['Financial Analyst', 'Risk Analyst', 'Investment Associate', 'Compliance Officer'],
  Healthcare: ['Clinical Data Analyst', 'Health Informatics Specialist', 'Project Manager', 'Operations Lead'],
  Education: ['Lecturer', 'Curriculum Designer', 'Programme Coordinator', 'Education Technologist'],
  Government: ['Policy Adviser', 'Statistician', 'Data Scientist', 'Operations Officer'],
  Media: ['Content Strategist', 'Producer', 'UX Designer', 'Communications Lead'],
  Retail: ['Buyer', 'Store Operations Manager', 'Merchandising Analyst', 'Marketing Manager'],
  Energy: ['Sustainability Analyst', 'Project Engineer', 'Operations Manager', 'Carbon Strategist'],
};

const COUNTRIES_WEIGHTED = [
  ['United Kingdom', 30],
  ['Ireland', 4],
  ['Germany', 3],
  ['Netherlands', 2],
  ['United States', 5],
  ['Canada', 2],
  ['Australia', 2],
  ['Singapore', 1],
  ['United Arab Emirates', 1],
];

const ACHIEVEMENT_TEMPLATES = {
  certification: [
    { title: 'AWS Solutions Architect Associate', refUrl: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/' },
    { title: 'Azure Fundamentals AZ-900', refUrl: 'https://learn.microsoft.com/certifications/exams/az-900' },
    { title: 'Google Cloud Associate Engineer', refUrl: 'https://cloud.google.com/certification/cloud-engineer' },
    { title: 'Certified Kubernetes Administrator', refUrl: 'https://www.cncf.io/certification/cka/' },
    { title: 'Certified ScrumMaster', refUrl: 'https://www.scrumalliance.org/get-certified/scrum-master-track/certified-scrummaster' },
    { title: 'Certified Information Systems Security Professional', refUrl: 'https://www.isc2.org/Certifications/CISSP' },
    { title: 'Tableau Desktop Specialist', refUrl: 'https://www.tableau.com/learn/certification/desktop-specialist' },
    { title: 'CompTIA Security+', refUrl: 'https://www.comptia.org/certifications/security' },
    { title: 'Power BI Data Analyst', refUrl: 'https://learn.microsoft.com/credentials/certifications/data-analyst-associate/' },
  ],
  licence: [
    { title: 'British Computer Society Chartered IT Professional', refUrl: 'https://www.bcs.org/membership/become-a-member/chartered-it-professional/' },
    { title: 'PMP Project Management Professional', refUrl: 'https://www.pmi.org/certifications/project-management-pmp' },
  ],
  course: [
    { title: 'Hands-on Machine Learning with Python', refUrl: 'https://www.coursera.org/learn/machine-learning' },
    { title: 'Agile Leadership Bootcamp', refUrl: 'https://www.scrum.org/courses/professional-agile-leadership' },
    { title: 'Data Storytelling with Tableau', refUrl: 'https://www.tableau.com/learn/training' },
    { title: 'UX Design Fundamentals', refUrl: 'https://www.interaction-design.org/courses/ux-design' },
  ],
};

const DEGREE_URL_BY_PROGRAMME = {
  'BSc Computer Science': 'https://www.eastminster.ac.uk/courses/computer-science',
  'BSc Information Technology': 'https://www.eastminster.ac.uk/courses/information-technology',
  'BSc Business Management': 'https://www.eastminster.ac.uk/courses/business-management',
  'BA Media & Communications': 'https://www.eastminster.ac.uk/courses/media-communications',
  'BSc Data Analytics': 'https://www.eastminster.ac.uk/courses/data-analytics',
  'BSc Cybersecurity': 'https://www.eastminster.ac.uk/courses/cybersecurity',
};

function pickWeighted(list) {
  const total = list.reduce((acc, it) => acc + (it.weight || it[1] || 1), 0);
  let r = Math.random() * total;
  for (const item of list) {
    const w = item.weight ?? item[1] ?? 1;
    if (r < w) return item;
    r -= w;
  }
  return list[list.length - 1];
}

function pickArrayWeighted(list, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i += 1) {
    if (r < weights[i]) return list[i];
    r -= weights[i];
  }
  return list[list.length - 1];
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(fromYear, toYear) {
  const year = fromYear + Math.floor(Math.random() * (toYear - fromYear + 1));
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const FIRST_NAMES = ['Aiden', 'Bea', 'Cara', 'Dev', 'Esra', 'Femi', 'Gita', 'Hugo', 'Iris', 'Jin', 'Kira', 'Liam', 'Maya', 'Nadia', 'Owen', 'Priya', 'Quinn', 'Rohan', 'Saira', 'Theo', 'Uma', 'Vik', 'Wren', 'Xiu', 'Yara', 'Zane'];
const LAST_NAMES = ['Abara', 'Becker', 'Chen', 'Dasgupta', 'Edwards', 'Fitzgerald', 'Garcia', 'Huang', 'Ibrahim', 'Jensen', 'Kowalski', 'Lopez', 'Murphy', 'Nakamura', 'Okafor', 'Patel', 'Quiroga', 'Roberts', 'Singh', 'Tanaka', 'Uzun', 'Visser', 'Wang', 'Xu', 'Yusuf', 'Zhao'];

const ALL_USER_INSERT = db.prepare(`
  INSERT INTO users (email, password_hash, role, email_verified_at, created_at, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const PROFILE_INSERT = db.prepare(`
  INSERT INTO profiles (user_id, first_name, last_name, biography, linkedin_url, programme, graduation_date, directory_visible, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const ACHIEVEMENT_INSERT = db.prepare(`
  INSERT INTO achievements (user_id, achievement_type, title, reference_url, completion_date)
  VALUES (?, ?, ?, ?, ?)
`);
const EMPLOYMENT_INSERT = db.prepare(`
  INSERT INTO employment_history (user_id, employer, job_title, start_date, end_date, industry_sector, location_country, location_city, is_current)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const TOKEN_INSERT = db.prepare(`
  INSERT INTO api_tokens (created_by_user_id, name, token_prefix, token_hash, scopes)
  VALUES (?, ?, ?, ?, ?)
`);

async function main() {
  const existingUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (existingUsers > 0 && !force) {
    console.error(`Database already contains ${existingUsers} users. Pass --force to overwrite.`);
    process.exit(1);
  }
  if (force) {
    db.prepare('DELETE FROM api_token_usage').run();
    db.prepare('DELETE FROM api_tokens').run();
    db.prepare('DELETE FROM analytics_filter_presets').run();
    db.prepare('DELETE FROM featured_slots').run();
    db.prepare('DELETE FROM bids').run();
    db.prepare('DELETE FROM alumni_event_participation').run();
    db.prepare('DELETE FROM employment_history').run();
    db.prepare('DELETE FROM achievements').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM users').run();
    console.log('Wiped existing data.');
  }

  const passwordHash = await hashPassword('Demo!12345678');

  const seedReferenceAccounts = db.transaction(() => {
    const staff = ALL_USER_INSERT.run(`analytics-demo@${EMAIL_DOMAIN}`, passwordHash, 'university_staff');
    const alumnus = ALL_USER_INSERT.run(`alumni-demo@${EMAIL_DOMAIN}`, passwordHash, 'alumni');
    PROFILE_INSERT.run(
      alumnus.lastInsertRowid, 'Demo', 'Alumnus',
      'Demo profile created by the seed script. Replace at any time with your own bio so sponsors can find you.',
      'https://www.linkedin.com/in/demo-alumnus',
      'BSc Computer Science', '2022-06-15', 1,
    );
    return { staffId: staff.lastInsertRowid, alumniId: alumnus.lastInsertRowid };
  });
  const refIds = seedReferenceAccounts();

  const tokens = [];
  for (const presetName of ['analytics_dashboard', 'ar_app']) {
    const tokenPair = createOpaqueTokenPair();
    const scopes = serializeScopes(CLIENT_PRESETS[presetName]);
    TOKEN_INSERT.run(
      refIds.staffId,
      `Seeded ${presetName.replace('_', ' ')} key`,
      tokenPair.prefix,
      tokenPair.hash,
      scopes,
    );
    tokens.push({ preset: presetName, scopes, plain: tokenPair.plain });
  }

  // 50 alumni with weighted programme/sector distributions.
  const insertCohort = db.transaction(() => {
    for (let i = 0; i < 50; i += 1) {
      const programme = pickWeighted(PROGRAMMES).name;
      const graduationDate = randomDate(2015, 2024);
      const firstName = randomChoice(FIRST_NAMES);
      const lastName = randomChoice(LAST_NAMES);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@${EMAIL_DOMAIN}`;
      const result = ALL_USER_INSERT.run(email, passwordHash, 'alumni');
      const userId = result.lastInsertRowid;
      PROFILE_INSERT.run(
        userId, firstName, lastName,
        `${firstName} ${lastName} graduated in ${graduationDate.slice(0, 4)} from ${programme} at Eastminster. Currently exploring industry trends and continuing to develop professional skills.`,
        `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${i}`,
        programme, graduationDate, 1,
      );

      // Degree achievement matching the programme.
      ACHIEVEMENT_INSERT.run(userId, 'degree', programme, DEGREE_URL_BY_PROGRAMME[programme], graduationDate);

      // 1-3 certifications, 0-1 licence, 0-2 short courses.
      const certCount = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < certCount; c += 1) {
        const cert = randomChoice(ACHIEVEMENT_TEMPLATES.certification);
        ACHIEVEMENT_INSERT.run(userId, 'certification', cert.title, cert.refUrl, randomDate(Number(graduationDate.slice(0, 4)), 2025));
      }
      if (Math.random() < 0.4) {
        const lic = randomChoice(ACHIEVEMENT_TEMPLATES.licence);
        ACHIEVEMENT_INSERT.run(userId, 'licence', lic.title, lic.refUrl, randomDate(Number(graduationDate.slice(0, 4)), 2025));
      }
      const courseCount = Math.floor(Math.random() * 3);
      for (let c = 0; c < courseCount; c += 1) {
        const cr = randomChoice(ACHIEVEMENT_TEMPLATES.course);
        ACHIEVEMENT_INSERT.run(userId, 'course', cr.title, cr.refUrl, randomDate(Number(graduationDate.slice(0, 4)), 2025));
      }

      // Employment history: 1-2 prior, then a current role.
      const sector = randomChoice(SECTORS);
      const country = pickArrayWeighted(COUNTRIES_WEIGHTED.map(([c]) => c), COUNTRIES_WEIGHTED.map(([, w]) => w));
      const employer = Math.random() < 0.4 ? randomChoice(EMPLOYERS_DOMINANT) : randomChoice(EMPLOYERS_LONG_TAIL);
      const jobTitle = randomChoice(JOB_TITLES_BY_SECTOR[sector] || ['Associate']);
      const currentStart = randomDate(Math.max(2018, Number(graduationDate.slice(0, 4))), 2024);
      // Optional past role.
      if (Math.random() < 0.6) {
        const priorEnd = currentStart;
        const priorStart = randomDate(Number(graduationDate.slice(0, 4)), Number(currentStart.slice(0, 4)));
        const priorEmployer = randomChoice(EMPLOYERS_LONG_TAIL);
        const priorTitle = randomChoice(JOB_TITLES_BY_SECTOR[sector] || ['Associate']);
        EMPLOYMENT_INSERT.run(userId, priorEmployer, priorTitle, priorStart, priorEnd, sector, country, 'London', 0);
      }
      EMPLOYMENT_INSERT.run(userId, employer, jobTitle, currentStart, null, sector, country, 'London', 1);
    }
  });
  insertCohort();

  console.log('---');
  console.log('Seed complete.');
  console.log('Reference accounts (password Demo!12345678):');
  console.log(`  - analytics-demo@${EMAIL_DOMAIN}  (university_staff)`);
  console.log(`  - alumni-demo@${EMAIL_DOMAIN}     (alumni)`);
  console.log('');
  console.log('API bearer tokens (copy now, only shown once):');
  tokens.forEach((t) => {
    console.log(`  - [${t.preset}] scopes=${t.scopes}`);
    console.log(`    Bearer ${t.plain}`);
  });
  console.log('---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
