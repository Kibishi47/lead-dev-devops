const jobs = require('../jobs');

describe('jobs.js', () => {
  test('should set, get and check completed jobs', () => {
    expect(jobs.hasJobCompleted('test')).toBe(false);
    expect(jobs.getJobFile('test')).toBeUndefined();

    jobs.setJobCompleted('test', 'public/users/zip_test.zip');

    expect(jobs.hasJobCompleted('test')).toBe(true);
    expect(jobs.getJobFile('test')).toBe('public/users/zip_test.zip');
  });
});
