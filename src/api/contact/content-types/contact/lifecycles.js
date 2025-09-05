export default {
  beforeCreate(event) {
    // Auto-publish contacts by setting publishedAt
    if (!event.params.data.publishedAt) {
      event.params.data.publishedAt = new Date();
    }
  },
};
