/**
 * Renders the public landing page that introduces the platform and links to
 * the appropriate sign-in / register flows for both alumni and university staff.
 */
const showLandingPage = (req, res) => {
  res.render('index', {
    title: 'Alumni Influencers',
  });
};

module.exports = { showLandingPage };
