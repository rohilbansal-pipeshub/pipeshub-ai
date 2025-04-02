import type { SubmitHandler } from 'react-hook-form';
import type { SelectChangeEvent } from '@mui/material';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';

import { alpha, useTheme } from '@mui/material/styles';
import {
  Box,
  Grid,
  Alert,
  Select,
  Button,
  MenuItem,
  TextField,
  Typography,
  InputLabel,
  IconButton,
  FormControl,
  InputAdornment,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { Iconify } from 'src/components/iconify';

// LLM form values interfaces
interface LlmFormValues {
  modelType: 'openai' | 'azure';
  apiKey: string;
  model: string;
  clientId?: string;
  endpoint?: string;
  deploymentName?: string;
}

interface OpenAILlmFormValues {
  modelType: 'openai';
  clientId: string;
  apiKey: string;
  model: string;
}

interface AzureLlmFormValues {
  modelType: 'azure';
  endpoint: string;
  apiKey: string;
  deploymentName: string;
  model: string;
}

interface LlmConfigFormProps {
  onValidationChange: (isValid: boolean) => void;
  onSaveSuccess?: () => void;
  provider?: string;
}

interface SaveResult {
  success: boolean;
  warning?: string;
  error?: string;
}

export interface LlmConfigFormRef {
  handleSave: () => Promise<SaveResult>;
}

// Zod schema for OpenAI validation
const openaiSchema = z.object({
  modelType: z.literal('openai'),
  clientId: z.string().min(1, 'Client ID is required'),
  apiKey: z.string().min(1, 'API Key is required'),
  model: z.string().min(1, 'Model is required'),
});

// Zod schema for Azure OpenAI validation
const azureSchema = z.object({
  modelType: z.literal('azure'),
  endpoint: z
    .string()
    .min(1, 'Endpoint is required')
    .startsWith('https://', 'Endpoint must start with https://'),
  apiKey: z.string().min(1, 'API Key is required'),
  deploymentName: z.string().min(1, 'Deployment Name is required'),
  model: z.string().min(1, 'Model is required'),
});

// Combined schema using discriminated union
const llmSchema = z.discriminatedUnion('modelType', [openaiSchema, azureSchema]);

// Utility functions for API interaction
const getLlmConfig = async (): Promise<LlmFormValues | null> => {
  try {
    const response = await axios.get('/api/v1/configurationManager/aiModelsConfig');
    const { data } = response;

    // Check if LLM configuration exists
    if (data.llm && data.llm.length > 0) {
      const config = data.llm[0].configuration;
      return config;
    }

    return null;
  } catch (error) {
    console.error('Error fetching LLM configuration:', error);
    throw error;
  }
};

const updateLlmConfig = async (config: LlmFormValues, provider = 'OpenAI'): Promise<any> => {
  try {
    // First get the current configuration
    const response = await axios.get('/api/v1/configurationManager/aiModelsConfig');
    const currentConfig = response.data;

    // Create the updated config object
    const updatedConfig = {
      ...currentConfig,
      llm: [
        {
          provider: provider,
          configuration: config,
        },
      ],
    };

    // Update the configuration
    const updateResponse = await axios.post(
      '/api/v1/configurationManager/aiModelsConfig',
      updatedConfig
    );
    return updateResponse;
  } catch (error) {
    console.error('Error updating LLM configuration:', error);
    throw error;
  }
};

const LlmConfigForm = forwardRef<LlmConfigFormRef, LlmConfigFormProps>(
  ({ onValidationChange, onSaveSuccess, provider = 'OpenAI' }, ref) => {
    const theme = useTheme();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showOpenAIPassword, setShowOpenAIPassword] = useState(false);
    const [showAzurePassword, setShowAzurePassword] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [formSubmitSuccess, setFormSubmitSuccess] = useState(false);

    const [modelType, setModelType] = useState<'openai' | 'azure'>(
      provider === 'Azure OpenAI' ? 'azure' : 'openai'
    );

    // Create separate forms for OpenAI and Azure
    const {
      control: openaiControl,
      handleSubmit: handleOpenAISubmit,
      reset: resetOpenAI,
      formState: { isValid: isOpenAIValid },
    } = useForm<OpenAILlmFormValues>({
      resolver: zodResolver(openaiSchema),
      mode: 'onChange',
      defaultValues: {
        modelType: 'openai',
        clientId: '',
        apiKey: '',
        model: '',
      },
    });

    const {
      control: azureControl,
      handleSubmit: handleAzureSubmit,
      reset: resetAzure,
      formState: { isValid: isAzureValid },
    } = useForm<AzureLlmFormValues>({
      resolver: zodResolver(azureSchema),
      mode: 'onChange',
      defaultValues: {
        modelType: 'azure',
        endpoint: '',
        apiKey: '',
        deploymentName: '',
        model: '',
      },
    });

    // OpenAI and Azure form submit handlers
    const onOpenAISubmit: SubmitHandler<OpenAILlmFormValues> = async (data) => {
      try {
        await updateLlmConfig(data, provider);
        if (onSaveSuccess) {
          onSaveSuccess();
        }
        setIsEditing(false);
        setFormSubmitSuccess(true);
      } catch (error) {
        const errorMessage = error.response?.data?.message || 'Failed to save OpenAI configuration';
        setSaveError(errorMessage);
        console.error('Error saving OpenAI configuration:', error);
        setFormSubmitSuccess(false);
      }
    };

    const onAzureSubmit: SubmitHandler<AzureLlmFormValues> = async (data) => {
      try {
        await updateLlmConfig(data, provider);
        if (onSaveSuccess) {
          onSaveSuccess();
        }
        setIsEditing(false);
        setFormSubmitSuccess(true);
      } catch (error) {
        const errorMessage =
          error.response?.data?.message || 'Failed to save Azure OpenAI configuration';
        setSaveError(errorMessage);
        console.error('Error saving Azure OpenAI configuration:', error);
        setFormSubmitSuccess(false);
      }
    };

    // Expose the handleSave method to the parent component
    useImperativeHandle(ref, () => ({
      handleSave: async (): Promise<SaveResult> => {
        try {
          setIsSaving(true);
          setSaveError(null);
          setFormSubmitSuccess(false);

          if (modelType === 'openai') {
            // This executes the form submission
            handleOpenAISubmit(onOpenAISubmit)();
          } else {
            // This executes the form submission
            handleAzureSubmit(onAzureSubmit)();
          }

          // Wait for a short time to allow the form submission to complete
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Check if there was an error during submission
          if (saveError) {
            setIsSaving(false);
            return {
              success: false,
              error: saveError,
            };
          }

          // If we got here, the submission was successful
          setIsSaving(false);
          return { success: true };
        } catch (error) {
          setIsSaving(false);
          console.error('Error in handleSave:', error);
          return {
            success: false,
            error: 'Unexpected error occurred during save operation',
          };
        }
      },
    }));

    // Load existing configuration on mount
    useEffect(() => {
      const fetchConfig = async () => {
        setIsLoading(true);
        try {
          const config = await getLlmConfig();

          if (config) {
            // Set the model type based on the configuration
            if (config.modelType) {
              setModelType(config.modelType);
            }

            // Reset the appropriate form based on the model type
            if (config.modelType === 'azure') {
              // For Azure configuration
              resetAzure({
                modelType: 'azure',
                endpoint: config.endpoint || '',
                apiKey: config.apiKey || '',
                deploymentName: config.deploymentName || '',
                model: config.model || '',
              });
            } else {
              // Default to OpenAI configuration
              resetOpenAI({
                modelType: 'openai',
                clientId: config.clientId || '',
                apiKey: config.apiKey || '',
                model: config.model || '',
              });
            }
          }
        } catch (error) {
          console.error('Failed to load LLM configuration:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchConfig();
    }, [resetOpenAI, resetAzure]);

    // Reset saveError when it changes
    useEffect(() => {
      if (saveError) {
        // Clear save error after 5 seconds
        const timer = setTimeout(() => {
          setSaveError(null);
        }, 5000);
        return () => clearTimeout(timer);
      }

      // Add an explicit return for when saveError is falsy
      return undefined; // or return () => {}; for an empty cleanup function
    }, [saveError]);

    // Notify parent of validation status
    useEffect(() => {
      const isCurrentFormValid = modelType === 'openai' ? isOpenAIValid : isAzureValid;
      onValidationChange(isCurrentFormValid && isEditing);
    }, [isOpenAIValid, isAzureValid, isEditing, modelType, onValidationChange]);

    // Handle model type change
    const handleModelTypeChange = (newType: 'openai' | 'azure') => {
      setModelType(newType);
      // Don't reset forms - we keep separate state for each
    };

    // Handle edit mode toggle
    const handleToggleEdit = () => {
      if (isEditing) {
        // Cancel edit - reload current data
        getLlmConfig().then((config) => {
          if (config) {
            // Make sure to set the model type correctly based on configuration
            if (config.modelType) {
              setModelType(config.modelType);
            }

            // Reset the appropriate form based on the model type
            if (config.modelType === 'azure') {
              resetAzure({
                modelType: 'azure',
                endpoint: config.endpoint || '',
                apiKey: config.apiKey || '',
                deploymentName: config.deploymentName || '',
                model: config.model || '',
              });
            } else {
              resetOpenAI({
                modelType: 'openai',
                clientId: config.clientId || '',
                apiKey: config.apiKey || '',
                model: config.model || '',
              });
            }
          } else {
            // Reset both forms to default values
            resetOpenAI({
              modelType: 'openai',
              clientId: '',
              apiKey: '',
              model: '',
            });
            resetAzure({
              modelType: 'azure',
              endpoint: '',
              apiKey: '',
              deploymentName: '',
              model: '',
            });
          }
        });
        setSaveError(null);
      }
      setIsEditing(!isEditing);
    };

    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress size={24} />
        </Box>
      );
    }

    return (
      <>
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
            icon="mdi:information-outline"
            width={20}
            height={20}
            color={theme.palette.info.main}
            style={{ marginTop: 2 }}
          />
          <Box>
            <Typography variant="body2" color="text.secondary">
              Configure your LLM provider to enable AI capabilities in your application.
              {modelType === 'azure'
                ? ' You need an active Azure subscription with Azure OpenAI Service enabled.'
                : ' Enter your OpenAI API credentials to get started.'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            onClick={handleToggleEdit}
            startIcon={<Iconify icon={isEditing ? 'mdi:close' : 'mdi:pencil'} />}
            color={isEditing ? 'error' : 'primary'}
            size="small"
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        </Box>

        <Grid container spacing={2.5}>
          {/* Model Type selector - common for both forms */}
          <Grid item xs={12}>
            <FormControl fullWidth size="small" disabled={!isEditing}>
              <InputLabel>Provider Type</InputLabel>
              <Select
                name="modelType"
                value={modelType}
                label="Provider Type"
                onChange={(e: SelectChangeEvent) => {
                  const newType = e.target.value as 'openai' | 'azure';
                  handleModelTypeChange(newType);
                }}
              >
                <MenuItem value="openai">OpenAI API</MenuItem>
                <MenuItem value="azure">Azure OpenAI Service</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* OpenAI Form */}
          {modelType === 'openai' && (
            <>
              <Grid item xs={12} md={6}>
                <Controller
                  name="clientId"
                  control={openaiControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="Client ID"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || 'Your OpenAI Client ID'}
                      required
                      disabled={!isEditing}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:identifier" width={18} height={18} />
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
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="apiKey"
                  control={openaiControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="API Key"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || 'Your OpenAI API Key'}
                      required
                      disabled={!isEditing}
                      type={showOpenAIPassword ? 'text' : 'password'}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:key" width={18} height={18} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowOpenAIPassword(!showOpenAIPassword)}
                              edge="end"
                              size="small"
                              disabled={!isEditing}
                            >
                              <Iconify
                                icon={showOpenAIPassword ? 'eva:eye-off-fill' : 'eva:eye-fill'}
                                width={16}
                                height={16}
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
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="model"
                  control={openaiControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="Model Name"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message || 'e.g., gpt-4o, gpt-4-turbo, gpt-3.5-turbo'
                      }
                      required
                      disabled={!isEditing}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:robot" width={18} height={18} />
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
                  )}
                />
              </Grid>
            </>
          )}

          {/* Azure OpenAI Form */}
          {modelType === 'azure' && (
            <>
              <Grid item xs={12} md={6}>
                <Controller
                  name="endpoint"
                  control={azureControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="Endpoint URL"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message || 'e.g., https://your-resource.openai.azure.com/'
                      }
                      required
                      disabled={!isEditing}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:link" width={18} height={18} />
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
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="deploymentName"
                  control={azureControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="Deployment Name"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || 'Your Azure OpenAI deployment name'}
                      required
                      disabled={!isEditing}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:cube-outline" width={18} height={18} />
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
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="apiKey"
                  control={azureControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="API Key"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || 'Your Azure OpenAI API Key'}
                      required
                      disabled={!isEditing}
                      type={showAzurePassword ? 'text' : 'password'}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:key" width={18} height={18} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowAzurePassword(!showAzurePassword)}
                              edge="end"
                              size="small"
                              disabled={!isEditing}
                            >
                              <Iconify
                                icon={showAzurePassword ? 'eva:eye-off-fill' : 'eva:eye-fill'}
                                width={16}
                                height={16}
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
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="model"
                  control={azureControl}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label="Model Name"
                      fullWidth
                      size="small"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || 'e.g., gpt-4, gpt-35-turbo'}
                      required
                      disabled={!isEditing}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="mdi:robot" width={18} height={18} />
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
                  )}
                />
              </Grid>
            </>
          )}
        </Grid>

        {saveError && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {saveError}
          </Alert>
        )}

        {isSaving && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </>
    );
  }
);

export default LlmConfigForm;
