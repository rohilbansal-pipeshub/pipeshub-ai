import { z } from 'zod';
import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';

import { alpha, useTheme } from '@mui/material/styles';
import {
  Box,
  Grid,
  Link,
  Alert,
  Paper,
  Button,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { Iconify } from 'src/components/iconify';

interface GoogleWorkspaceConfigFormProps {
  onValidationChange: (isValid: boolean) => void;
  onSaveSuccess?: () => void;
}

export interface GoogleWorkspaceConfigFormRef {
  handleSave: () => Promise<boolean>;
}

const getRedirectUris = async () => {
  // Get the current window URL without hash and search parameters
  const currentUrl = new URL(window.location.href);
  currentUrl.hash = '';
  currentUrl.search = '';
  const currentWindowLocation = currentUrl.toString();

  // Get the frontend URL from the backend
  try {
    const response = await axios.get(`/api/v1/configurationManager/frontendPublicUrl`);
    const frontendBaseUrl = response.data.url;
    // Ensure the URL ends with a slash if needed
    const frontendUrl = frontendBaseUrl.endsWith('/')
      ? `${frontendBaseUrl}account/individual/settings/connector/googleWorkspace`
      : `${frontendBaseUrl}/account/individual/settings/connector/googleWorkspace`;

    return {
      currentWindowLocation,
      recommendedRedirectUri: frontendUrl,
      urisMismatch: currentWindowLocation !== frontendUrl,
    };
  } catch (error) {
    console.error('Error fetching frontend URL:', error);
    return {
      currentWindowLocation,
      recommendedRedirectUri: currentWindowLocation,
      urisMismatch: false,
    };
  }
};

// Define Zod schema for form validation
const googleWorkspaceConfigSchema = z.object({
  clientId: z.string().min(1, { message: 'Client ID is required' }),
  clientSecret: z.string().min(1, { message: 'Client Secret is required' }),
  redirectUri: z.string().url({ message: 'Please enter a valid URL' }),
});

type GoogleWorkspaceConfigFormData = z.infer<typeof googleWorkspaceConfigSchema>;

const GoogleWorkspaceConfigForm = forwardRef<
  GoogleWorkspaceConfigFormRef,
  GoogleWorkspaceConfigFormProps
>(({ onValidationChange, onSaveSuccess }, ref) => {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<GoogleWorkspaceConfigFormData>({
    clientId: '',
    clientSecret: '',
    redirectUri: '', // Will be set after fetching
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [redirectUris, setRedirectUris] = useState<{
    currentWindowLocation: string;
    recommendedRedirectUri: string;
    urisMismatch: boolean;
  } | null>(null);

  useEffect(() => {
    const initializeForm = async () => {
      setIsLoading(true);
      // Get redirect URIs info
      const uris = await getRedirectUris();
      setRedirectUris(uris);

      // Initialize form with recommended redirect URI
      setFormData((prev) => ({
        ...prev,
        redirectUri: uris.recommendedRedirectUri,
      }));

      // Then fetch existing config
      try {
        const response = await axios.get('/api/v1/connectors/config', {
          params: {
            service: 'googleWorkspace',
          },
        });

        if (response.data) {
          setFormData({
            clientId: response.data.googleClientId || '',
            clientSecret: response.data.googleClientSecret || '',
            redirectUri: uris.recommendedRedirectUri,
          });
          setIsConfigured(true);
        }
      } catch (error) {
        console.error('Error fetching Google Workspace config:', error);
        setSaveError('Failed to fetch configuration.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeForm();
  }, []);

  // Expose the handleSave method to the parent component
  useImperativeHandle(ref, () => ({
    handleSave,
  }));

  // Validate form using Zod and notify parent
  useEffect(() => {
    try {
      // Parse the data with zod schema
      googleWorkspaceConfigSchema.parse(formData);
      setErrors({});
      onValidationChange(true);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        // Extract errors into a more manageable format
        const errorMap: Record<string, string> = {};
        validationError.errors.forEach((err) => {
          const path = err.path.join('.');
          errorMap[path] = err.message;
        });
        setErrors(errorMap);
        onValidationChange(false);
      }
    }
  }, [formData, onValidationChange]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Don't update redirectUri when user tries to change it
    if (name === 'redirectUri') return;

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handle file upload click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileUploadError(null);

    // Read the file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (event.target?.result) {
          const jsonContent = JSON.parse(event.target.result as string);

          // Keep the current redirectUri
          const currentRedirectUri = formData.redirectUri;

          // Check if the JSON has the required fields
          if (jsonContent.web) {
            // Google OAuth credentials format
            const { client_id, client_secret } = jsonContent.web;

            setFormData({
              clientId: client_id || '',
              clientSecret: client_secret || '',
              redirectUri: currentRedirectUri, // Keep the current redirectUri
            });
          } else if (jsonContent.installed) {
            // Service account credentials format
            const { client_id, client_secret } = jsonContent.installed;

            setFormData({
              clientId: client_id || '',
              clientSecret: client_secret || '',
              redirectUri: currentRedirectUri, // Keep the current redirectUri
            });
          } else if (jsonContent.clientId) {
            // Direct format
            setFormData({
              clientId: jsonContent.clientId || '',
              clientSecret: jsonContent.clientSecret || '',
              redirectUri: currentRedirectUri, // Keep the current redirectUri
            });
          } else {
            setFileUploadError('Invalid JSON format. Could not find client credentials.');
          }
        }
      } catch (error) {
        console.error('Error parsing JSON file:', error);
        setFileUploadError('Error parsing JSON file. Please ensure it is a valid JSON.');
      }
    };

    reader.readAsText(file);
  };

  // Toggle secret visibility
  const handleToggleClientSecretVisibility = () => {
    setShowClientSecret(!showClientSecret);
  };

  // Handle save
  const handleSave = async (): Promise<boolean> => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Validate the form data with Zod before saving
      googleWorkspaceConfigSchema.parse(formData);

      // Send the update request
      await axios.post('/api/v1/connectors/config', formData, {
        params: {
          service: 'googleWorkspace',
        },
      });

      // Update the configured state
      setIsConfigured(true);
      setSaveSuccess(true);

      if (onSaveSuccess) {
        onSaveSuccess();
      }

      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Handle validation errors
        const errorMap: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          errorMap[path] = err.message;
        });
        setErrors(errorMap);
        setSaveError('Please correct the form errors before saving');
      } else {
        // Handle API errors
        setSaveError('Failed to save Google Workspace configuration');
        console.error('Error saving Google Workspace config:', error);
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to get field error
  const getFieldError = (fieldName: string): string => errors[fieldName] || '';

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

          {saveSuccess && (
            <Alert
              severity="success"
              sx={{
                mb: 3,
                borderRadius: 1,
              }}
            >
              Configuration saved successfully! Remember to configure this redirect URI in your
              Google Cloud Console.
            </Alert>
          )}

          {redirectUris?.urisMismatch && (
            <Alert
              severity="warning"
              sx={{
                mb: 3,
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                Redirect URI mismatch detected! Using the recommended URI from backend
                configuration.
              </Typography>
              <Typography variant="caption" component="div">
                Current window location: {redirectUris.currentWindowLocation}
              </Typography>
              <Typography variant="caption" component="div">
                Recommended redirect URI: {redirectUris.recommendedRedirectUri}
              </Typography>
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
                To configure Google Workspace integration, you will need to create OAuth 2.0
                credentials in the{' '}
                <Link
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener"
                  sx={{ fontWeight: 500 }}
                >
                  Google Cloud Console
                </Link>
                . You can either upload your JSON credentials file or enter the details manually.
              </Typography>
              <Typography variant="body2" color="primary.main" sx={{ mt: 1, fontWeight: 500 }}>
                Important: You must set the redirect URI in your Google Cloud Console to exactly
                match: {formData.redirectUri}
              </Typography>
            </Box>
          </Box>

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
                <Typography
                  component="span"
                  variant="body2"
                  color="primary.main"
                  sx={{ fontWeight: 500 }}
                >
                  Redirect URI:
                </Typography>{' '}
                {formData.redirectUri}
              </Typography>
            </Box>
          </Box>

          {/* File Upload Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Upload Credentials JSON
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
                borderStyle: 'dashed',
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.02),
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
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                  }}
                >
                  <Iconify
                    icon="mdi:file-text-outline"
                    width={24}
                    height={24}
                    color={theme.palette.primary.main}
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle2">{fileName || 'No file selected'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Upload your Google Cloud OAuth credentials JSON file
                  </Typography>
                </Box>
              </Box>

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

          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Or Enter Details Manually
          </Typography>

          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Client ID"
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                placeholder="Enter your Google Client ID"
                error={Boolean(getFieldError('clientId'))}
                helperText={
                  getFieldError('clientId') || 'The OAuth 2.0 client ID from Google Cloud Console'
                }
                required
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Iconify icon="eva:hash-outline" width={18} height={18} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: alpha(theme.palette.text.primary, 0.15),
                    },
                  },
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Client Secret"
                name="clientSecret"
                type={showClientSecret ? 'text' : 'password'}
                value={formData.clientSecret}
                onChange={handleChange}
                placeholder="Enter your Google Client Secret"
                error={Boolean(getFieldError('clientSecret'))}
                helperText={
                  getFieldError('clientSecret') ||
                  'The OAuth 2.0 client secret from Google Cloud Console'
                }
                required
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Iconify icon="eva:lock-outline" width={18} height={18} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleToggleClientSecretVisibility}
                        edge="end"
                        size="small"
                      >
                        <Iconify
                          icon={showClientSecret ? 'eva:eye-off-outline' : 'eva:eye-outline'}
                          width={18}
                          height={18}
                        />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: alpha(theme.palette.text.primary, 0.15),
                    },
                  },
                }}
              />
            </Grid>
          </Grid>

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
