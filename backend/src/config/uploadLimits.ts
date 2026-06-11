/** Maximum files per upload batch across ScriptCheck upload flows. */
export const MAX_UPLOAD_FILES = 20;

export const MAX_UPLOAD_FILE_SIZE_MB = 25;
export const MAX_BULK_SCRIPT_FILE_SIZE_MB = 50;

export const MAX_UPLOAD_FILE_SIZE = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
export const MAX_BULK_SCRIPT_FILE_SIZE = MAX_BULK_SCRIPT_FILE_SIZE_MB * 1024 * 1024;
