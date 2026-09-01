const completedJobs = {};

module.exports = {
  setJobCompleted: (tags, fileName) => {
    completedJobs[tags] = fileName;
  },
  getJobFile: (tags) => {
    return completedJobs[tags];
  },
  hasJobCompleted: (tags) => {
    return !!completedJobs[tags];
  }
};
