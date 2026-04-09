/**
 * @typedef {Object} Post
 * @property {string} id - The document ID from Firestore
 * @property {string} title - The title of the publication
 * @property {string} content - The content/body of the post
 * @property {string} author - The name or ID of the author
 * @property {Date} createdAt - Timestamp of creation
 * @property {string} [imageUrl] - Optional image URL
 */

class PostModel {
  constructor(id, data) {
    this.id = id;
    this.title = data.title || '';
    this.content = data.content || '';
    this.author = data.author || 'Anonymous';
    this.status = data.status || 'pending'; // New field: pending, approved, rejected
    this.createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
    this.imageUrl = data.imageUrl || null;
  }

  static fromFirestore(doc) {
    return new PostModel(doc.id, doc.data());
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      content: this.content,
      author: this.author,
      status: this.status,
      createdAt: this.createdAt,
      imageUrl: this.imageUrl
    };
  }
}

module.exports = PostModel;
