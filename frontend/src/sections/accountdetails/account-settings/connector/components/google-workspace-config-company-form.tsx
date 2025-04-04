import { useRef, useState, useEffect, forwardRef, useCallback, useImperativeHandle } from 'react';

import { alpha, useTheme } from '@mui/material/styles';
import {
  Box,
  Link,
  Alert,
  Paper,
  Stack,
  Button,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { Iconify } from 'src/components/iconify';

interface GoogleWorkspaceConfigFormProps {
  onValidationChange: (isValid: boolean) => void;
  onSaveSuccess?: () => void;
  onFileRemoved?: () => void;
}

export interface GoogleWorkspaceConfigFormRef {
  handleSave: () => Promise<boolean>;
}

export const GoogleWorkspaceConfigForm = forwardRef<
  GoogleWorkspaceConfigFormRef,
  GoogleWorkspaceConfigFormProps
>(({ onValidationChange, onSaveSuccess, onFileRemoved }, ref) => {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasExistingFile, setHasExistingFile] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminEmailError, setAdminEmailError] = useState<string | null>(null);

  // Validate email format
  const validateEmail = useCallback((email: string): boolean => {
    if (!email) {
      setAdminEmailError('Google Workspace Admin email is required');
      return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailPattern.test(email);

    if (!isValid) {
      setAdminEmailError('Please enter a valid email address');
      return false;
    }

    setAdminEmailError(null);
    return true;
  }, []);

  // Validate form based on file and admin email
  const validateForm = useCallback(
    (hasFile: boolean, email: string) => {
      const isFileValid = hasFile;
      const isEmailValid = validateEmail(email);

      onValidationChange(isFileValid && isEmailValid);
      return isFileValid && isEmailValid;
    },
    [onValidationChange, validateEmail]
  );

  // Load existing configuration on component mount
  useEffect(() => {
    const fetchExistingConfig = async () => {
      try {
        const response = await axios.get('/api/v1/connectors/credentials', {
          params: {
            service: 'googleWorkspace',
          },
        });

        if (response.data && response.data.isConfigured) {
          setHasExistingFile(true);
          if (response.data.fileName) {
            setFileName(response.data.fileName);
          } else {
            setFileName('google-workspace-credentials.json');
          }

          // Set admin email if it exists in the response
          if (response.data.adminEmail) {
            setAdminEmail(response.data.adminEmail);
          }

          validateForm(true, response.data.adminEmail || '');
        }
      } catch (error) {
        console.error('Error fetching existing configuration:', error);
        // If error, assume no config exists
        setHasExistingFile(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingConfig();
  }, [validateForm]);

  // Expose the handleSave method to the parent component
  useImperativeHandle(ref, () => ({
    handleSave,
  }));

  // Update validation state when file is selected or removed or admin email changes
  useEffect(() => {
    validateForm(hasExistingFile || !!selectedFile, adminEmail);
  }, [selectedFile, hasExistingFile, adminEmail, validateForm]);

  // Handle admin email change
  const handleAdminEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setAdminEmail(email);
    validateEmail(email);
  };

  // Handle file upload click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (!hasExistingFile) {
        setSelectedFile(null);
        setFileName(null);
        setFileUploadError(null);
        validateForm(false, adminEmail);
      }
      return;
    }

    setFileName(file.name);
    setFileUploadError(null);

    // Check file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setFileUploadError('Only JSON files are accepted.');
      setSelectedFile(null);
      if (!hasExistingFile) {
        validateForm(false, adminEmail);
      }
      return;
    }

    setSelectedFile(file);
    validateForm(true, adminEmail);
  };

  // Handle file download
  const handleDownload = async () => {
    if (selectedFile) {
      // If we have a file in memory, download it directly
      const url = URL.createObjectURL(selectedFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (hasExistingFile) {
      // If we have a file on the server, fetch and download it
      try {
        setIsLoading(true);
        const response = await axios.get('/api/v1/connectors/credentials/download', {
          params: {
            service: 'googleWorkspace',
          },
          responseType: 'blob',
        });

        const url = URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'google-workspace-credentials.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error downloading file:', error);
        setSaveError(`Failed to download configuration file":${error.message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle save - upload the file directly
  const handleSave = async (): Promise<boolean> => {
    // Validate form before saving
    if (!validateForm(hasExistingFile || !!selectedFile, adminEmail)) {
      return false;
    }

    // If no new file is selected and we already have a config, just update admin email
    if (!selectedFile && hasExistingFile) {
      try {
        setIsSaving(true);
        setSaveError(null);

        // Send admin email update
        await axios.post('/api/v1/connectors/credentials', {
          service: 'googleWorkspace',
          adminEmail,
        });

        if (onSaveSuccess) {
          onSaveSuccess();
        }

        return true;
      } catch (error) {
        console.error('Error updating admin email:', error);
        setSaveError(`Failed to update Google Workspace admin email: ${error.message}`);
        return false;
      } finally {
        setIsSaving(false);
      }
    }

    if (!selectedFile) {
      setFileUploadError('Please select a JSON file to upload.');
      return false;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Create FormData with the file and admin email
      const formData = new FormData();

      // Add the file
      formData.append('googleWorkspaceCredentials', selectedFile);

      // Add the admin email
      formData.append('adminEmail', adminEmail);

      // Send the file to the backend
      const response = await axios.post('/api/v1/connectors/credentials', formData, {
        params: {
          service: 'googleWorkspace',
        },
        // Let axios set the Content-Type header with correct boundary
      });

      setHasExistingFile(true);

      if (onSaveSuccess) {
        onSaveSuccess();
      }

      return true;
    } catch (error) {
      console.error('Error uploading Google Workspace config:', error);
      setSaveError(`Failed to upload Google Workspace configuration file :${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Handle file removal
  const handleRemoveFile = () => {
    if (hasExistingFile && !selectedFile) {
      // If removing a server-side file
      setIsLoading(true);

      axios
        .delete('/api/v1/connectors/credentials', {
          params: {
            service: 'googleWorkspace',
          },
        })
        .then(() => {
          setHasExistingFile(false);
          setFileName(null);
          setAdminEmail('');
          validateForm(false, adminEmail);
          if (onFileRemoved) {
            onFileRemoved();
          }
        })

        .catch((error) => {
          console.error('Error removing configuration:', error);
          setSaveError(`Failed to remove configuration ${error.message}`);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // If removing a locally selected file
      setSelectedFile(null);
      if (!hasExistingFile) {
        setFileName(null);
        validateForm(false, adminEmail);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {saveError && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                borderRadius: 1,
              }}
            >
              {saveError}
            </Alert>
          )}

          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.info.main, 0.04),
              border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
            }}
          >
            <Iconify
              icon="eva:info-outline"
              width={20}
              height={20}
              color={theme.palette.info.main}
              style={{ marginTop: 2 }}
            />
            <Box>
              <Typography variant="body2" color="text.secondary">
                To configure Google Workspace integration, you need to upload your Services
                credentials JSON file from the{' '}
                <Link
                  href="https://console.cloud.google.com/iam-admin/serviceaccounts/"
                  target="_blank"
                  rel="noopener"
                  sx={{ fontWeight: 500 }}
                >
                  Google Cloud Console
                </Link>
                .
              </Typography>
            </Box>
          </Box>

          {/* Google Workspace Admin Email Field */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Google Workspace Admin Email
            </Typography>
            <TextField
              fullWidth
              required
              value={adminEmail}
              onChange={handleAdminEmailChange}
              placeholder="admin@yourdomain.com"
              error={!!adminEmailError}
              helperText={adminEmailError}
              sx={{ mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              Enter the email address of a Google Workspace administrator with appropriate
              permissions
            </Typography>
          </Box>

          {/* File Upload Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              {hasExistingFile ? 'Google Workspace Credentials' : 'Upload Credentials JSON'}
            </Typography>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: 'center',
                justifyContent: 'space-between',
                borderColor: alpha(theme.palette.primary.main, 0.2),
                borderStyle: hasExistingFile ? 'solid' : 'dashed',
                borderRadius: 1,
                bgcolor: hasExistingFile
                  ? alpha(theme.palette.success.main, 0.04)
                  : alpha(theme.palette.primary.main, 0.02),
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '8px',
                    bgcolor: hasExistingFile
                      ? alpha(theme.palette.success.main, 0.08)
                      : alpha(theme.palette.primary.main, 0.08),
                  }}
                >
                  <Iconify
                    icon={
                      hasExistingFile ? 'eva:checkmark-circle-outline' : 'mdi:file-text-outline'
                    }
                    width={24}
                    height={24}
                    color={
                      hasExistingFile ? theme.palette.success.main : theme.palette.primary.main
                    }
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle2">
                    {fileName || 'No file selected'}
                    {hasExistingFile && !selectedFile && ' (Saved)'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {hasExistingFile && !selectedFile
                      ? 'Google Workspace credentials are configured'
                      : 'Upload your Google Cloud OAuth credentials JSON file'}
                  </Typography>
                </Box>
              </Box>

              {hasExistingFile || selectedFile ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleDownload}
                    startIcon={<Iconify icon="eva:download-outline" width={18} height={18} />}
                    color="primary"
                    sx={{
                      minWidth: 120,
                      flexShrink: 0,
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleRemoveFile}
                    startIcon={<Iconify icon="eva:trash-outline" width={18} height={18} />}
                    color="error"
                    sx={{
                      minWidth: 120,
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </Button>
                  {hasExistingFile && !selectedFile && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleUploadClick}
                      startIcon={<Iconify icon="eva:edit-outline" width={18} height={18} />}
                      sx={{
                        minWidth: 120,
                        flexShrink: 0,
                      }}
                    >
                      Replace
                    </Button>
                  )}
                </Stack>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleUploadClick}
                  startIcon={<Iconify icon="eva:upload-outline" width={18} height={18} />}
                  sx={{
                    minWidth: 120,
                    flexShrink: 0,
                  }}
                >
                  Upload JSON
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </Paper>

            {fileUploadError && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                {fileUploadError}
              </Typography>
            )}
          </Box>

          {isSaving && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </>
      )}
    </>
  );
});

export default GoogleWorkspaceConfigForm;
