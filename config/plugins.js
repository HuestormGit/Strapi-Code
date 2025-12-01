// module.exports = () => ({});
module.exports = ({ env }) => ({
  email: {
    config: {
      provider: 'nodemailer', // <-- Must be "nodemailer" in Strapi v5
      providerOptions: {
        host: env('SMTP_HOST', 'smtpout.secureserver.net'),
        port: env.int('SMTP_PORT', 465),
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
        },
        secure: true
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'no-reply@shreevedafoods.in'),
        defaultReplyTo: env('SMTP_REPLY_TO', 'no-reply@shreevedafoods.in')
      }
    }
  }
});

