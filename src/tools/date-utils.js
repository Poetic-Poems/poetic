/**
 * Date utility functions for converting between yyyy-mm-dd and display formats
 */

/**
 * Convert yyyy-mm-dd format to "DayOfWeek, DD Month YYYY" format
 * @param {string} dateStr - Date in yyyy-mm-dd format
 * @returns {string} - Date in "DayOfWeek, DD Month YYYY" format
 */
function formatDateForDisplay(dateStr) {
  if (!dateStr || dateStr === "Unknown Date") {
    return "Unknown Date";
  }

  let date;

  // Handle Date objects (from YAML parsing)
  if (dateStr instanceof Date) {
    date = dateStr;
    if (isNaN(date.getTime())) {
      console.warn(`Warning: Invalid date object: ${dateStr}`);
      return "Unknown Date";
    }
  } else {
    // Ensure dateStr is a string
    dateStr = String(dateStr);

    // Check if already in display format
    if (dateStr.includes(',') && dateStr.includes(' ')) {
      return dateStr;
    }

    // Parse yyyy-mm-dd format
    date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues

    if (isNaN(date.getTime())) {
      console.warn(`Warning: Invalid date format: ${dateStr}`);
      return "Unknown Date";
    }
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = dayNames[date.getDay()];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName}, ${day} ${month} ${year}`;
}

/**
 * Parse date string for sorting (handles both formats)
 * @param {string} dateStr - Date string in either format
 * @returns {Date} - Date object for sorting
 */
function parseDateForSorting(dateStr) {
  if (!dateStr || dateStr === "Unknown Date") {
    return new Date(0);
  }

  // If it's in yyyy-mm-dd format, parse directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr + 'T00:00:00');
    return isNaN(date.getTime()) ? new Date(0) : date;
  }

  // If it's in display format, parse the old way
  const months = {
    'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
    'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
  };

  const parts = dateStr.split(', ');
  if (parts.length >= 2) {
    const datePart = parts[1].split(' ');
    if (datePart.length >= 3) {
      const day = parseInt(datePart[0]);
      const month = months[datePart[1]];
      const year = parseInt(datePart[2]);
      if (!isNaN(day) && month !== undefined && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  }

  return new Date(0); // fallback for invalid dates
}

module.exports = {
  formatDateForDisplay,
  parseDateForSorting
};
