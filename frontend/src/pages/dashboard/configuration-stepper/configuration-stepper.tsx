import closeIcon from '@iconify-icons/eva/close-outline';
import React, { useRef, useState, useEffect } from 'react';

import {
  Step,
  Alert,
  Button,
  Dialog,
  Stepper,
  useTheme,
  Snackbar,
  StepLabel,
  Typography,
  IconButton,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { CONFIG } from 'src/config-global';

import { Iconify } from 'src/components/iconify';

import scrollableContainerStyle from 'src/sections/qna/chatbot/utils/styles/scrollbar';

import { useAuthContext } from 'src/auth/hooks';

import { storageTypes } from './types';
import LlmConfigStep from './llm-config';
import SmtpConfigStep from './smtp-config';
import StorageConfigStep from './storage-config';
import ConnectorConfigStep from './connector-config';

import type {
  LlmFormValues,
  SmtpFormValues,
  StorageFormValues,
  AzureLlmFormValues,
  OpenAILlmFormValues,
  ConnectorFormValues,
} from './types';

// Updated steps to include Storage
const steps: string[] = ['LLM', 'Storage', 'Connector', 'SMTP'];

// API base URLs
const API_BASE_URL = '/api/v1/configurationManager';
const ORG_API_BASE_URL = '/api/v1/org';

interface ConfigurationStepperProps {
  open: boolean;
  onClose: () => void;
}

const ConfigurationStepper: React.FC<ConfigurationStepperProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const { user } = useAuthContext();
  const accountType = user?.accountType || 'individual';

  const [activeStep, setActiveStep] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string>('');
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });
  // Use a ref to track if onboarding status has been updated
  // This prevents redundant API calls
  const statusUpdated = useRef<boolean>(false);

  // Track which steps are being skipped
  const [skipSteps, setSkipSteps] = useState<{
    llm: boolean; // This will always be false now (required)
    storage: boolean; // Add storage step
    connector: boolean;
    smtp: boolean;
  }>({
    llm: false,
    storage: false,
    connector: false,
    smtp: false,
  });

  // State to hold form values from each step
  const [llmValues, setLlmValues] = useState<LlmFormValues | null>(null);
  const [storageValues, setStorageValues] = useState<StorageFormValues | null>(null);
  const [connectorValues, setConnectorValues] = useState<ConnectorFormValues | null>(null);
  const [smtpValues, setSmtpValues] = useState<SmtpFormValues | null>(null);
  const [serviceCredentialsFile, setServiceCredentialsFile] = useState<File | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');

  // Reset state when dialog is opened
  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setSubmissionSuccess(false);
      setSubmissionError('');
      // Reset the statusUpdated flag when dialog opens
      statusUpdated.current = false;
      // Reset skip states
      setSkipSteps({
        llm: false,
        storage: false,
        connector: false,
        smtp: false,
      });
    }
  }, [open]);

  // Function to update onboarding status via API, only if not already updated
  // This function should ONLY be called when explicitly needed via button clicks
  const updateOnboardingStatus = async (status: 'configured' | 'skipped'): Promise<void> => {
    if (statusUpdated.current) {
      return;
    }

    try {
      await axios.put(`${ORG_API_BASE_URL}/onboarding-status`, { status });
      statusUpdated.current = true;
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Failed to update on boarding status`,
        severity: 'error',
      });
      throw error;
    }
  };

  // Intercept the close action - ONLY update status if explicitly canceling via button
  const handleCloseWithStatus = async () => {
    try {
      setIsSubmitting(true);
      // Only update status to 'skipped' when explicitly clicking Cancel
      await updateOnboardingStatus('skipped');
    } catch (error) {
      console.error('Error updating onboarding status:', error);
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  // This is called when the user clicks the X or clicks outside the dialog
  // We should NOT update the status in this case
  const handleCloseNoStatus = () => {
    // Just close without updating status
    onClose();
  };

  const handleSkipStep = (step: 'storage' | 'connector' | 'smtp'): void => {
    // Mark the step as skipped
    setSkipSteps((prev) => ({ ...prev, [step]: true }));

    // If skipping storage, set default local storage values
    if (step === 'storage') {
      const defaultLocalStorage: StorageFormValues = {
        storageType: storageTypes.LOCAL,
        mountName: '',
        baseUrl: '',
      };
      setStorageValues(defaultLocalStorage);
    }

    // If this is the last step (SMTP), submit all configurations
    if (step === 'smtp' && activeStep === 3) {
      submitAllConfigurations();
    } else {
      // Otherwise, move to the next step
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };
  // Update the handleNext function in ConfigurationStepper.tsx
  const handleNext = async (): Promise<void> => {
    // For LLM step, verify we have values before continuing
    if (activeStep === 0) {
      if (!llmValues) {
        // Try to submit the LLM form first
        const llmFormSubmitted = await submitLlmForm();
        if (!llmFormSubmitted) {
          setSubmissionError('LLM configuration is required before proceeding.');
          return;
        }
      }
      // Successfully have LLM values, go to next step
      setActiveStep(1);
      return;
    }

    // For Storage step
    if (activeStep === 1) {
      // If already marked as skipped, just go to the next step
      if (skipSteps.storage) {
        setActiveStep(2);
        return;
      }

      // If we already have storage values, just go to the next step
      if (storageValues) {
        setActiveStep(2);
        return;
      }

      // Otherwise, try to submit the form or skip
      const storageFormSubmitted = await submitStorageForm();
      if (!storageFormSubmitted) {
        // Storage is not required, so skip if invalid
        handleSkipStep('storage');
        return;
      }
      setActiveStep(2);
      return;
    }

    // For Connector step
    if (activeStep === 2) {
      // If already marked as skipped, just go to the next step
      if (skipSteps.connector) {
        setActiveStep(3);
        return;
      }

      // If we already have connector values, just go to the next step
      if (connectorValues) {
        setActiveStep(3);
        return;
      }

      // Otherwise, try to submit the form or skip
      const connectorFormSubmitted = await submitConnectorForm();
      if (!connectorFormSubmitted) {
        handleSkipStep('connector');
        return;
      }
      setActiveStep(3);
    }
  };

  const handleBack = (): void => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleLlmSubmit = (data: LlmFormValues): void => {
    setLlmValues(data);
    setSkipSteps((prev) => ({ ...prev, llm: false })); // Ensure it's marked as not skipped

    // Give time for state to update before moving to next step
    setTimeout(() => {
      // If this is the last step (shouldn't happen normally, but just in case)
      if (activeStep === steps.length - 1) {
        submitAllConfigurations();
      } else {
        handleNext();
      }
    }, 0);
  };

  // Handle storage step submission
  const handleStorageSubmit = (data: StorageFormValues): void => {
    setStorageValues(data);
    setSkipSteps((prev) => ({ ...prev, storage: false })); // Ensure it's marked as not skipped

    // Give time for state to update before moving to next step
    setTimeout(() => {
      // If this is the last step (shouldn't happen normally, but just in case)
      if (activeStep === steps.length - 1) {
        submitAllConfigurations();
      } else {
        handleNext();
      }
    }, 0);
  };

  const handleConnectorSubmit = (data: ConnectorFormValues, file: File | null): void => {
    setConnectorValues(data);
    setServiceCredentialsFile(file);
    setSkipSteps((prev) => ({ ...prev, connector: false })); // Ensure it's marked as not skipped
    if (data.googleWorkspace.adminEmail) {
      setAdminEmail(data.googleWorkspace.adminEmail);
    }

    // Give time for state to update before moving to next step
    setTimeout(() => {
      // If this is the last step (shouldn't happen normally, but just in case)
      if (activeStep === steps.length - 1) {
        submitAllConfigurations();
      } else {
        handleNext();
      }
    }, 0);
  };

  const handleSmtpSubmit = (data: SmtpFormValues): void => {
    setSmtpValues(data);
    setSkipSteps((prev) => ({ ...prev, smtp: false })); // Ensure it's marked as not skipped

    // When the last step is completed, submit all configurations
    // Give time for state to update before submitting
    setTimeout(() => {
      submitAllConfigurations(data);
    }, 0);
  };

  // Submit LLM form programmatically
  const submitLlmForm = async (): Promise<boolean> => {
    // Method 1: Use the window method if available
    if (typeof (window as any).submitLlmForm === 'function') {
      const result = (window as any).submitLlmForm();
      // Wait for state to update
      await new Promise((resolve) => setTimeout(resolve, 100));
      return result || !!llmValues;
    }

    // Method 2: Find and click the "Continue" button in the LLM form
    const llmContinueButton = document.querySelector('#llm-config-form button[type="submit"]');

    if (llmContinueButton) {
      (llmContinueButton as HTMLButtonElement).click();
      // We need to wait a small amount of time for the form submission to complete
      // and update the llmValues state
      await new Promise((resolve) => setTimeout(resolve, 100));
      return !!llmValues;
    }

    // If we already have values, we're good
    if (llmValues) {
      return true;
    }

    return false;
  };

  // Submit Storage form programmatically
  const submitStorageForm = async (): Promise<boolean> => {
    try {
      // Method 1: Use the window method
      if (typeof (window as any).submitStorageForm === 'function') {
        const result = await Promise.resolve((window as any).submitStorageForm());
        // Wait for state to update
        await new Promise((resolve) => setTimeout(resolve, 100));
        return result === true; // Ensure it's explicitly true
      }

      // Method 2: Find and click the submit button
      const storageSubmitButton = document.querySelector(
        '#storage-config-form button[type="submit"]'
      );

      if (storageSubmitButton) {
        (storageSubmitButton as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Check validation status
        const formValid =
          typeof (window as any).isStorageFormValid === 'function'
            ? await Promise.resolve((window as any).isStorageFormValid())
            : false;
        return formValid === true;
      }

      return false;
    } catch (error) {
      console.error('Error validating storage form:', error);
      return false;
    }
  };

  // Submit Connector form programmatically
  const submitConnectorForm = async (): Promise<boolean> => {
    try {
      // Method 1: Use the window method
      if (typeof (window as any).submitConnectorForm === 'function') {
        const result = await Promise.resolve((window as any).submitConnectorForm());
        // Wait for state to update
        await new Promise((resolve) => setTimeout(resolve, 100));
        return result === true; // Ensure it's explicitly true
      }

      // Method 2: Find and click the submit button
      const connectorSubmitButton = document.querySelector('#connector-form-submit-button');

      if (connectorSubmitButton) {
        (connectorSubmitButton as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return !!connectorValues;
      }

      return false;
    } catch (error) {
      console.error('Error validating connector form:', error);
      return false;
    }
  };

  // Submit all configurations at once
  const submitAllConfigurations = async (smtpData?: SmtpFormValues): Promise<void> => {
    try {
      setIsSubmitting(true);
      setSubmissionError('');
      setSubmissionSuccess(false);

      // Make sure we have LLM values (required)
      if (!llmValues) {
        // Try to submit the LLM form
        const llmFormSubmitted = await submitLlmForm();
        if (!llmFormSubmitted) {
          setSubmissionError(
            'LLM configuration is required. Please complete the LLM configuration.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      // If storage is skipped and no storage values, set default local storage
      if (skipSteps.storage && !storageValues) {
        const defaultLocalStorage: StorageFormValues = {
          storageType: storageTypes.LOCAL,
        };
        setStorageValues(defaultLocalStorage);
      }

      const apiCalls = [];

      // Prepare LLM config API call (always required)
      const llmConfig = {
        llm: [
          {
            provider:
              llmValues!.modelType === 'openai'
                ? 'openAI'
                : llmValues!.modelType === 'gemini'
                  ? 'gemini'
                  : llmValues!.modelType === 'anthropic'
                    ? 'anthropic'
                    : 'azureOpenAI',
            configuration: (() => {
              // For OpenAI config
              if (
                llmValues!.modelType === 'openai' ||
                llmValues!.modelType === 'gemini' ||
                llmValues!.modelType === 'anthropic'
              ) {
                const config: any = {
                  apiKey: llmValues!.apiKey,
                  model: llmValues!.model,
                };

                // Only include clientId if it has a value
                const { clientId } = llmValues as OpenAILlmFormValues;
                if (clientId && clientId.trim() !== '') {
                  config.clientId = clientId;
                }

                return config;
              }

              // For Azure OpenAI config (no else needed)
              const config: any = {
                apiKey: llmValues!.apiKey,
                model: llmValues!.model,
              };

              // Only include fields with values
              const azureValues = llmValues as AzureLlmFormValues;

              if (azureValues.endpoint && azureValues.endpoint.trim() !== '') {
                config.endpoint = azureValues.endpoint;
              }

              if (azureValues.deploymentName && azureValues.deploymentName.trim() !== '') {
                config.deploymentName = azureValues.deploymentName;
              }

              return config;
            })(),
          },
        ],
        // Include other model types with empty arrays to match API format
        ocr: [],
        embedding: [],
        slm: [],
        reasoning: [],
        multiModal: [],
      };

      apiCalls.push(axios.post(`${API_BASE_URL}/aiModelsConfig`, llmConfig));

      // Prepare Storage config API call
      if (storageValues) {
        // Prepare the payload based on storage type
        let storageConfig: any = {
          storageType: storageValues.storageType,
        };

        switch (storageValues.storageType) {
          case storageTypes.S3:
            // S3 fields are all required
            storageConfig = {
              ...storageConfig,
              s3AccessKeyId: storageValues.s3AccessKeyId,
              s3SecretAccessKey: storageValues.s3SecretAccessKey,
              s3Region: storageValues.s3Region,
              s3BucketName: storageValues.s3BucketName,
            };
            break;

          case storageTypes.AZURE_BLOB:
            // Add required Azure fields
            storageConfig = {
              ...storageConfig,
              accountName: storageValues.accountName,
              accountKey: storageValues.accountKey,
              containerName: storageValues.containerName,
            };

            // Set default values first, then override if custom values provided
            storageConfig.endpointProtocol = 'https';
            storageConfig.endpointSuffix = 'core.windows.net';

            // Only add optional fields if they have values
            if (storageValues.endpointProtocol && storageValues.endpointProtocol.trim() !== '') {
              storageConfig.endpointProtocol = storageValues.endpointProtocol;
            }

            if (storageValues.endpointSuffix && storageValues.endpointSuffix.trim() !== '') {
              storageConfig.endpointSuffix = storageValues.endpointSuffix;
            }
            break;

          case storageTypes.LOCAL:
            // Only add optional fields if they have values
            if (storageValues.mountName && storageValues.mountName.trim() !== '') {
              storageConfig.mountName = storageValues.mountName;
            }

            if (storageValues.baseUrl && storageValues.baseUrl.trim() !== '') {
              storageConfig.baseUrl = storageValues.baseUrl;
            }
            break;

          default:
            // This shouldn't happen as storageType is validated by the form
            // Use a type assertion to handle the potentially unknown storage type
            console.warn(
              `Unknown storage type: ${(storageValues as any).storageType}, using default config`
            );
            break;
        }

        apiCalls.push(
          axios.post(`${API_BASE_URL}/storageConfig`, storageConfig, {
            headers: {
              'Content-Type': 'application/json',
            },
          })
        );
      }

      // Prepare Google Workspace config API call if not skipped and has values
      if (!skipSteps.connector && connectorValues) {
        if (accountType === 'business') {
          // Business account with file upload
          if (serviceCredentialsFile) {
            const formData = new FormData();
            formData.append('googleWorkspaceCredentials', serviceCredentialsFile);
            formData.append('adminEmail', adminEmail);
            if (connectorValues.googleWorkspace?.serviceCredentials) {
              // If we have parsed data from the file, only include non-empty fields
              const serviceAccount: any = {};

              // Only add fields with values
              const gwValues = connectorValues.googleWorkspace;

              if (gwValues.clientId && gwValues.clientId.trim() !== '') {
                serviceAccount.clientId = gwValues.clientId;
              }

              if (gwValues.clientEmail && gwValues.clientEmail.trim() !== '') {
                serviceAccount.clientEmail = gwValues.clientEmail;
              }

              if (gwValues.privateKey && gwValues.privateKey.trim() !== '') {
                serviceAccount.privateKey = gwValues.privateKey;
              }

              if (gwValues.projectId && gwValues.projectId.trim() !== '') {
                serviceAccount.projectId = gwValues.projectId;
              }

              // Only append if we have at least one field
              if (Object.keys(serviceAccount).length > 0) {
                formData.append('serviceAccount', JSON.stringify(serviceAccount));
              }
            }

            apiCalls.push(
              axios.post(
                `${CONFIG.backendUrl}/api/v1/connectors/credentials?service=googleWorkspace`,
                formData,
                {
                  headers: {
                    'Content-Type': 'multipart/form-data',
                  },
                }
              )
            );
          }
        } else if (
          connectorValues.googleWorkspace?.clientId ||
          connectorValues.googleWorkspace?.clientSecret
        ) {
          // Individual account with manual entry or file upload (that populated form fields)
          const payload: any = {};
          const gwValues = connectorValues.googleWorkspace;

          // Only add fields with values
          if (gwValues.clientId && gwValues.clientId.trim() !== '') {
            payload.clientId = gwValues.clientId;
          }

          if (gwValues.clientSecret && gwValues.clientSecret.trim() !== '') {
            payload.clientSecret = gwValues.clientSecret;
          }

          // Only make the API call if we have at least one field
          if (Object.keys(payload).length > 0) {
            apiCalls.push(
              axios.post(`${API_BASE_URL}/connectors/googleWorkspaceOauthConfig`, payload, {
                headers: {
                  'Content-Type': 'application/json',
                },
              })
            );
          }
        }
      }

      // Prepare SMTP config API call if not skipped and has values
      const finalSmtpData = smtpData || smtpValues;
      if (!skipSteps.smtp && finalSmtpData) {
        // Create base config with required fields
        const smtpConfig: any = {
          host: finalSmtpData.host,
          port: Number(finalSmtpData.port),
          fromEmail: finalSmtpData.fromEmail,
        };

        // Only add optional fields if they have values
        if (finalSmtpData.username && finalSmtpData.username.trim() !== '') {
          smtpConfig.username = finalSmtpData.username;
        }

        if (finalSmtpData.password && finalSmtpData.password.trim() !== '') {
          smtpConfig.password = finalSmtpData.password;
        }

        apiCalls.push(axios.post(`${API_BASE_URL}/smtpConfig`, smtpConfig));
      }

      // Execute all API calls in parallel
      if (apiCalls.length > 0) {
        await Promise.all(apiCalls);
        // Update onboarding status to 'configured' - explicitly calling after successful submission
        await updateOnboardingStatus('configured');

        setSubmissionSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
        setSnackbar({
          open: true,
          message: `Configuration completed`,
          severity: 'success',
        });
      } else {
        // Should not happen anymore since LLM is required
        setSubmissionError('No configurations were set. Please configure at least one service.');
      }
    } catch (error: any) {
      setSubmissionError(
        error.response?.data?.message || 'An error occurred while saving configurations'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for skipping the entire configuration
  const handleSkipConfiguration = async (): Promise<void> => {
    try {
      setIsSubmitting(true);

      // Update onboarding status to 'skipped' - explicitly calling when user clicks Skip Configuration
      await updateOnboardingStatus('skipped');

      setSubmissionSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      setSubmissionError('Failed to skip the configuration process. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueWithValidation = async () => {
    // Clear any previous error messages
    setSubmissionError('');

    switch (activeStep) {
      case 0: {
        // LLM step - always required
        // Always validate LLM values regardless of previous state
        if (llmValues) {
          // Even if we have values, re-validate to ensure they're still valid
          const llmSuccess = await submitLlmForm();
          if (!llmSuccess) {
            setSubmissionError(
              'LLM configuration is required. All fields must be filled correctly.'
            );
            return;
          }
          setActiveStep(1);
        } else {
          const llmSuccess = await submitLlmForm();
          if (!llmSuccess) {
            setSubmissionError(
              'LLM configuration is required. All fields must be filled correctly.'
            );
            return;
          }
          setActiveStep(1);
        }
        break;
      }

      case 1: {
        // Storage step
        // IMPORTANT: Reset the skip state when user tries to continue
        // This ensures validation is applied even if previously skipped
        if (skipSteps.storage) {
          // If user wants to continue instead of skip now, we should validate
          setSkipSteps((prev) => ({ ...prev, storage: false }));
        }

        // Now validate storage form regardless of previous state
        const storageSuccess = await submitStorageForm();

        if (!storageSuccess) {
          setSubmissionError(
            'All required fields for storage must be filled correctly. If you don\'t want to configure storage, please use the "Use Default Storage" button.'
          );
          return;
        }

        setActiveStep(2);
        break;
      }

      case 2: {
        // Connector step
        // IMPORTANT: Reset the skip state when user tries to continue
        // This ensures validation is applied even if previously skipped
        if (skipSteps.connector) {
          // If user wants to continue instead of skip now, we should validate
          setSkipSteps((prev) => ({ ...prev, connector: false }));
        }

        // Check if user has entered any data
        const hasConnectorInput =
          typeof (window as any).hasConnectorInput === 'function'
            ? (window as any).hasConnectorInput()
            : false;

        if (hasConnectorInput) {
          // If there's any data, validate all fields
          const connectorSuccess = await submitConnectorForm();
          if (!connectorSuccess) {
            setSubmissionError(
              'Please complete all required fields for Google Workspace configuration. If you don\'t want to configure Google Workspace, use the "Skip Google Workspace" button.'
            );
            return;
          }
        } else {
          // No data entered - force using the Skip button
          setSubmissionError(
            'Please use the "Skip Google Workspace" button if you don\'t want to configure Google Workspace.'
          );
          return;
        }

        setActiveStep(3);
        break;
      }

      case 3: {
        // SMTP step (final)
        // IMPORTANT: Reset the skip state when user tries to continue
        // This ensures validation is applied even if previously skipped
        if (skipSteps.smtp) {
          // If user wants to continue instead of skip now, we should validate
          setSkipSteps((prev) => ({ ...prev, smtp: false }));
        }

        // Check if there's any input in the SMTP form
        const hasSmtpInput =
          typeof (window as any).hasSmtpInput === 'function'
            ? (window as any).hasSmtpInput()
            : false;

        if (hasSmtpInput) {
          // If there's any input, validate ALL fields
          const isValid = await Promise.resolve((window as any).submitSmtpForm());
          if (!isValid) {
            setSubmissionError(
              'Please complete all required SMTP fields or use the "Skip SMTP Configuration" button.'
            );
            return;
          }
        } else {
          // No input - force using the Skip button
          setSubmissionError(
            'Please use the "Skip SMTP Configuration" button if you don\'t want to configure SMTP.'
          );
          return;
        }

        // If valid, proceed with submission
        await submitAllConfigurations();
        break;
      }

      default:
        break;
    }
  };

  const renderStepContent = (step: number): React.ReactNode => {
    switch (step) {
      case 0:
        return (
          <LlmConfigStep
            onSubmit={handleLlmSubmit}
            onSkip={() => {}} // LLM can no longer be skipped
            initialValues={llmValues}
          />
        );
      case 1:
        return (
          <StorageConfigStep
            onSubmit={handleStorageSubmit}
            onSkip={() => handleSkipStep('storage')}
            initialValues={storageValues}
          />
        );
      case 2:
        return (
          <ConnectorConfigStep
            onSubmit={handleConnectorSubmit}
            onSkip={() => handleSkipStep('connector')}
            initialValues={connectorValues}
            initialFile={serviceCredentialsFile}
            setMessage={(message) =>
              setSnackbar({
                open: true,
                message,
                severity: 'error',
              })
            }
          />
        );
      case 3:
        return (
          <SmtpConfigStep
            onSubmit={handleSmtpSubmit}
            onSkip={() => handleSkipStep('smtp')}
            isSubmitting={isSubmitting}
            initialValues={smtpValues}
          />
        );
      default:
        return null;
    }
  };

  const renderFooterButtons = () => {
    if (submissionSuccess) {
      return null; // No buttons needed when submission is successful
    }

    // Determine if the Continue/Complete Setup button should be enabled
    const primaryButtonEnabled = () => {
      // If submitting, always disable
      if (isSubmitting) return false;

      // For LLM step (first step) - always enable to allow validation on click
      if (activeStep === 0) {
        return true;
      }

      // For other steps, LLM must be configured (which it should be if we got here)
      return true;
    };

    return (
      <>
        {/* Cancel button - only show after first step */}
        {activeStep > 0 && (
          <Button onClick={handleCloseWithStatus} disabled={isSubmitting} sx={{ mr: 1 }}>
            Cancel
          </Button>
        )}
        {/* Back button - only show if not on first step */}
        {activeStep > 0 && (
          <Button onClick={handleBack} disabled={isSubmitting} sx={{ mr: 1 }}>
            Back
          </Button>
        )}
        {/* Skip button - only show for intermediate steps (not first, not last) */}
        {activeStep > 0 && activeStep < steps.length - 1 && (
          <Button
            color="inherit"
            onClick={() => {
              // Make it very clear this is for using default settings
              switch (activeStep) {
                case 1:
                  // Storage step - explicitly mention going with default local storage
                  handleSkipStep('storage');
                  break;
                case 2:
                  handleSkipStep('connector');
                  break;
                default:
                  break;
              }
            }}
            disabled={isSubmitting}
            sx={{ mr: 1 }}
          >
            Skip
          </Button>
        )}
        {/* Skip button for last step - changed to "Skip SMTP" for clarity */}
        {activeStep === steps.length - 1 && (
          <Button
            color="inherit"
            onClick={() => handleSkipStep('smtp')}
            disabled={isSubmitting}
            sx={{ mr: 1 }}
          >
            Skip SMTP
          </Button>
        )}
        {/* Primary action button */}
        <Button
          variant="contained"
          color="primary"
          onClick={handleContinueWithValidation}
          disabled={!primaryButtonEnabled()}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting
            ? 'Saving...'
            : activeStep === steps.length - 1
              ? 'Complete Setup'
              : 'Continue'}
        </Button>
      </>
    );
  };

  // Get the completion status for the stepper
  const getStepStatus = (stepIndex: number): 'completed' | 'active' | undefined => {
    if (activeStep === stepIndex) return 'active';

    // Mark steps as completed if either they're done or skipped
    if (stepIndex < activeStep) {
      switch (stepIndex) {
        case 0:
          return llmValues ? 'completed' : undefined; // LLM can't be skipped
        case 1:
          return skipSteps.storage || storageValues ? 'completed' : undefined;
        case 2:
          return skipSteps.connector || connectorValues ? 'completed' : undefined;
        default:
          return undefined;
      }
    }

    return undefined;
  };

  const handleManualSubmit = async () => {
    try {
      // Verify LLM is configured - required
      if (!llmValues) {
        setSubmissionError('LLM configuration is required.');
        return;
      }

      // If we're on the SMTP step
      if (activeStep === 3) {
        // IMPORTANT: Reset the skip state if continuing
        if (skipSteps.smtp) {
          setSkipSteps((prev) => ({ ...prev, smtp: false }));
        }

        // Check if there's any input in the SMTP form
        const hasSmtpInput =
          typeof (window as any).hasSmtpInput === 'function'
            ? (window as any).hasSmtpInput()
            : false;

        if (hasSmtpInput) {
          // If there's any input, validate ALL fields
          const isValid = await Promise.resolve((window as any).submitSmtpForm());
          if (!isValid) {
            setSubmissionError(
              'Please complete all required SMTP fields or use the "Skip SMTP Configuration" button.'
            );
            return;
          }
        } else {
          // No input - force using the Skip button
          setSubmissionError(
            'Please use the "Skip SMTP Configuration" button if you don\'t want to configure SMTP.'
          );
          return;
        }
      }

      // All validations passed, submit configurations
      await submitAllConfigurations();
    } catch (error) {
      console.error('Error in form submission:', error);
      setSubmissionError('An error occurred during validation. Please try again.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        // Only close if not clicking outside
        if (reason !== 'backdropClick') {
          handleCloseNoStatus();
        }
      }}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1,
        },
      }}
      // Prevent closing by pressing escape for important configuration
      disableEscapeKeyDown
    >
      <DialogTitle sx={{ px: 3, pt: 2, pb: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h6">System Configuration</Typography>
        <IconButton
          edge="end"
          color="inherit"
          onClick={handleCloseWithStatus}
          disabled={isSubmitting}
          aria-label="close"
        >
          <Iconify icon={closeIcon} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 2, pb: 1, ...scrollableContainerStyle }}>
        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
          {steps.map((label, index) => (
            <Step key={label} completed={getStepStatus(index) === 'completed'}>
              <StepLabel>
                {label}
                {/* No "Skipped" label for LLM anymore since it's required */}
                {skipSteps.storage && index === 1 && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    (Skipped)
                  </Typography>
                )}
                {skipSteps.connector && index === 2 && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    (Skipped)
                  </Typography>
                )}
                {skipSteps.smtp && index === 3 && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    (Skipped)
                  </Typography>
                )}
              </StepLabel>
            </Step>
          ))}
        </Stepper>

        {submissionSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Configuration saved successfully.
          </Alert>
        ) : (
          <>
            {submissionError && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSubmissionError('')}>
                {submissionError}
              </Alert>
            )}
            {renderStepContent(activeStep)}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>{renderFooterButtons()}</DialogActions>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          sx={{
            width: '100%',
            ...(snackbar.severity === 'success' && {
              bgcolor: theme.palette.success.main,
              color: theme.palette.success.contrastText,
            }),
          }}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
};

export default ConfigurationStepper;
