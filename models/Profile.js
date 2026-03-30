const mongoose = require('mongoose');

const degreeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
  completionDate: { type: Date, required: true }
});

const certificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
  completionDate: { type: Date, required: true }
});

const licenceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
  completionDate: { type: Date, required: true }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
  completionDate: { type: Date, required: true }
});

const employmentSchema = new mongoose.Schema({
  position: { type: String, required: true },
  company: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: Date
});

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  biography: { type: String, required: true },
  linkedinUrl: { type: String, required: true },
  profileImage: String,
  degrees: [degreeSchema],
  certifications: [certificationSchema],
  licences: [licenceSchema],
  courses: [courseSchema],
  employmentHistory: [employmentSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
profileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Profile', profileSchema);
