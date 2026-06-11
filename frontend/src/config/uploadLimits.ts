/** Maximum files per upload batch — must match backend uploadLimits.ts */
export const MAX_UPLOAD_FILES = 20;

export const MAX_UPLOAD_FILE_SIZE_MB = 25;
export const MAX_BULK_SCRIPT_FILE_SIZE_MB = 50;

export const UPLOAD_FILES_HINT = `You can upload up to ${MAX_UPLOAD_FILES} files at a time.`;
