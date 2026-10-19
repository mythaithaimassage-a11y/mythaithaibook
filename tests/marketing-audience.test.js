import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../api/booking.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functionNames = [
  'audienceFilterOptions',
  'finalizeAudienceCriteria',
  'parseAudienceQuery',
  'matchAudienceOption',
  'buildManualAudienceCriteria',
  'parseBookingDate',
  'isBirthdayInAudienceWindow',
  'resolveMarketingAudience',
];
const constantNames = new Set([
  'WEEKDAYS',
  'AUDIENCE_MEMBERSHIP_TYPES',
  'AUDIENCE_BIRTHDAY_WINDOWS',
  'AUDIENCE_CUSTOMER_TYPES',
  'AUDIENCE_HELP_MESSAGE',
]);
const declarations = [];
function collect(node) {
  if (ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text)) {
    declarations.push(node.getText(ast));
  } else if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && constantNames.has(declaration.name.text)) {
        declarations.push(node.getText(ast));
        break;
      }
    }
  }
  ts.forEachChild(node, collect);
}
collect(ast);
const helpers = vm.runInNewContext(`${declarations.join('\n')}\n({ ${
  functionNames.join(', ')
} })`);

function utcDate(value) {
  return Date.parse(`${value}T00:00:00Z`);
}

test('birthday windows support upcoming days, current and next month, and reject malformed dates', () => {
  const today = utcDate('2026-10-19');
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-10-19', '7', today), true);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-10-25', '7', today), true);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-10-26', '7', today), false);
  assert.equal(helpers.isBirthdayInAudienceWindow('10/25/1990', '7', today), true);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-10-31', 'month', today), true);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-11-01', 'month', today), false);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-11-01', 'nextMonth', today), true);
  assert.equal(helpers.isBirthdayInAudienceWindow('1990-02-30', '30', today), false);
  assert.equal(helpers.isBirthdayInAudienceWindow('not-a-date', '30', today), false);
});

test('audience parsing and manual filters support birthday and first-time or returning customers', () => {
  const fromText = helpers.parseAudienceQuery('customers with birthdays next month', []);
  assert.equal(fromText.birthdayWindow, 'nextMonth');
  const returning = helpers.parseAudienceQuery('returning customers', []);
  assert.equal(returning.customerType, 'returning');
  const manual = helpers.buildManualAudienceCriteria({
    birthdayWindow: '30',
    customerType: 'new',
  }, []);
  assert.equal(manual.birthdayWindow, '30');
  assert.equal(manual.customerType, 'new');
  assert.match(manual.description, /birthday in the next 30 days/);
  assert.match(manual.description, /one past booking/);
});

test('birthday audience queries only birthday fields and still requires active marketing consent', async () => {
  const clinicToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const day = (offset) => new Date(Date.parse(`${clinicToday}T00:00:00Z`) + offset * 86400000)
    .toISOString().slice(5, 10);
  const closeDate = `1990-${day(5)}`;
  const laterDate = `1990-${day(10)}`;
  const makeContact = (email, status = 'subscribed') => [
    email, email.split('@')[0], status, '', '', 'a'.repeat(64),
  ];
  const contacts = [
    makeContact('soon@example.com'),
    makeContact('later@example.com'),
    makeContact('unsubscribed@example.com', 'unsubscribed'),
  ];
  const bookingRows = contacts.map(([email], index) => [
    `booking-${index}`, '', email.split('@')[0], email, 'Central', 'Massage', '',
    new Date(Date.parse(`${clinicToday}T00:00:00Z`) - 86400000).toISOString().slice(0, 10),
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Confirmed',
  ]);
  let birthdayQueryCount = 0;
  const context = {
    CALENDAR_TIME_ZONE: 'America/Toronto',
    getMarketingContactRows: async () => contacts,
    bqFetchBookingRows: async () => ({ data: { values: bookingRows } }),
    bqLoyaltyValuesGet: async () => ({ data: { values: [['Email'], ['']] } }),
    pruneDeletedMarketingContacts: async (_sheets, rows) => ({ contacts: rows, removed: [] }),
    bqMarketingBirthdayRowsGet: async () => {
      birthdayQueryCount++;
      return [
        { email: 'soon@example.com', date_of_birth: closeDate },
        { email: 'later@example.com', date_of_birth: laterDate },
        { email: 'unsubscribed@example.com', date_of_birth: closeDate },
      ];
    },
    normalizeLoyaltyEmail: (email) => String(email || '').trim().toLowerCase(),
  };
  const runtime = vm.runInNewContext(`${declarations.join('\n')}\n({ resolveMarketingAudience })`, context);
  const result = await runtime.resolveMarketingAudience({}, {}, {
    mode: 'manual',
    filters: { birthdayWindow: '7' },
  });
  assert.deepEqual(Array.from(result.recipients, (recipient) => recipient.email), ['soon@example.com']);
  assert.equal(birthdayQueryCount, 1);

  await runtime.resolveMarketingAudience({}, {}, {
    mode: 'manual',
    filters: { allOptedIn: true },
  });
  assert.equal(birthdayQueryCount, 1);
});
