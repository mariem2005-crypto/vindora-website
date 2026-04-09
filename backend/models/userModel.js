/**
 * @typedef {Object} User
 * @property {string} uid - The unique ID from Firebase (matches Auth and Firestore)
 * @property {string} prenom - User's first name
 * @property {string} nom - User's last name
 * @property {string} email - User's email address
 * @property {string} role - User's role (admin, user)
 * @property {string} status - Account status (active, blocked)
 * @property {Date} joinedAt - Timestamp when the user registered
 */

class UserModel {
  constructor(uid, data) {
    this.uid = uid;
    this.prenom = data.prenom || '';
    this.nom = data.nom || '';
    this.email = data.email || '';
    this.role = data.role || 'user';
    this.status = data.status || 'active';
    this.joinedAt = data.joinedAt ? data.joinedAt.toDate() : new Date();
  }

  static fromFirestore(doc) {
    return new UserModel(doc.id, doc.data());
  }

  getFullName() {
    return `${this.prenom} ${this.nom}`.trim();
  }

  toJSON() {
    return {
      uid: this.uid,
      prenom: this.prenom,
      nom: this.nom,
      fullName: this.getFullName(),
      email: this.email,
      role: this.role,
      status: this.status,
      joinedAt: this.joinedAt
    };
  }
}

module.exports = UserModel;
