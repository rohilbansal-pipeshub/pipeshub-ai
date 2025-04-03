import { useState } from 'react';

import { alpha, useTheme } from '@mui/material/styles';
import {
  Box,
  Grid,
  Paper,
  Alert,
  Snackbar,
  Container,
  Typography,
  IconButton,
} from '@mui/material';

import { Iconify } from 'src/components/iconify';

import ConfigureServiceDialog from './configure-services-dialog';

// Service configuration list
const SERVICES_LIST = [
  {
    id: 'redis',
    icon: 'logos:redis',
    title: 'Redis',
    description: 'In-memory data structure store used as a database, cache, and message broker',
    color: '#DC382D',
  },
  {
    id: 'kafka',
    icon: 'mdi:apache-kafka',
    description: 'Distributed event streaming platform for high-performance data pipelines',
    title: 'Kafka',
    color: '#231F20',
  },
  {
    id: 'mongoDb',
    icon: 'simple-icons:mongodb',
    description: 'NoSQL document database for modern applications',
    title: 'MongoDB',
    color: '#47A248',
  },
  {
    id: 'arangoDb',
    icon: 'simple-icons:arangodb',
    description: 'Multi-model database system for graphs, documents and key-values',
    title: 'ArangoDB',
    color: '#D12C2F',
  },
  {
    id: 'qdrant',
    icon: 'carbon:data-vis-4',
    description: 'Vector database for similarity search and machine learning',
    title: 'Qdrant',
    color: '#FF9800',
  },
  {
    id: 'storage',
    icon: 'mdi:database',
    description: 'Configure storage options for your application (Local, S3, Azure Blob)',
    title: 'Storage Service',
    color: '#0078D4',
  },
];

// Define the save result interface
interface SaveResult {
  success: boolean;
  warning?: string;
  error?: string;
}

const ExternalServicesSettings = () => {
  const theme = useTheme();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [currentService, setCurrentService] = useState<string | null>(null);

  // Notification states
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState(
    'External services settings updated successfully'
  );

  // Handle closing of different snackbars
  const handleCloseSuccess = () => {
    setSuccess(false);
  };

  const handleCloseError = () => {
    setError(null);
  };

  const handleCloseWarning = () => {
    setWarning(null);
  };

  // Handle service selection
  const handleConfigureService = (serviceId: string) => {
    setCurrentService(serviceId);
    setConfigDialogOpen(true);
  };

  const handleSaveConfiguration = (result?: SaveResult) => {
    if (result) {
      if (result.warning) {
        setWarning(result.warning);
      }

      if (result.error) {
        setError(result.error);
        // Keep dialog open if there's an error
        return;
      }

      if (result.success) {
        // Only show success if there was no error
        setSuccessMessage(
          `${currentService ? getServiceTitle(currentService) : 'Service'} configuration updated successfully`
        );
        setSuccess(true);
      }
    } else {
      // Legacy support - if no result object is provided, assume success
      setSuccessMessage(
        `${currentService ? getServiceTitle(currentService) : 'Service'} configuration updated successfully`
      );
      setSuccess(true);
    }

    setConfigDialogOpen(false);
    setCurrentService(null);
  };

  // Helper to get service title for success message
  const getServiceTitle = (serviceId: string): string => {
    const service = SERVICES_LIST.find((s) => s.id === serviceId);
    return service ? service.title : 'Service';
  };

  return (
    <Container maxWidth="lg">
      <Paper
        sx={{
          overflow: 'hidden',
          position: 'relative',
          p: 3,
          borderRadius: 2,
          boxShadow: (themeShadow) => `0 2px 20px ${alpha(themeShadow.palette.grey[500], 0.15)}`,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Header section */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            mb: 4,
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 600,
                mb: 1,
                color: theme.palette.text.primary,
              }}
            >
              External Services
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500 }}>
              Configure connections to external services and databases
            </Typography>
          </Box>
        </Box>

        {/* Services Grid */}
        <Grid container spacing={2} mb={4}>
          {SERVICES_LIST.map((service) => (
            <Grid item xs={12} key={service.id}>
              <Paper
                sx={{
                  p: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                    borderColor: alpha(service.color, 0.3),
                  },
                }}
              >
                {/* Service info */}
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mr: 2,
                      bgcolor: alpha(service.color, 0.1),
                      color: service.color,
                      borderRadius: 1.5,
                    }}
                  >
                    <Iconify icon={service.icon} width={26} height={26} />
                  </Box>

                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {service.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {service.description}
                    </Typography>
                  </Box>
                </Box>

                {/* Settings icon */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfigureService(service.id);
                  }}
                  sx={{
                    mr: 1,
                    color: theme.palette.text.secondary,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: theme.palette.primary.main,
                    },
                  }}
                  aria-label={`Configure ${service.title}`}
                >
                  <Iconify icon="eva:settings-2-outline" width={20} height={20} />
                </IconButton>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Service Configuration Dialog */}
      <ConfigureServiceDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        onSave={handleSaveConfiguration}
        serviceType={currentService}
      />

      {/* Success snackbar */}
      <Snackbar
        open={success}
        autoHideDuration={5000}
        onClose={handleCloseSuccess}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 6 }}
      >
        <Alert
          onClose={handleCloseSuccess}
          severity="success"
          variant="filled"
          sx={{
            width: '100%',
            boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.12)',
          }}
        >
          {successMessage}
        </Alert>
      </Snackbar>

      {/* Warning snackbar */}
      <Snackbar
        open={!!warning}
        autoHideDuration={5000}
        onClose={handleCloseWarning}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 14 }}
      >
        <Alert
          onClose={handleCloseWarning}
          severity="warning"
          variant="filled"
          sx={{
            width: '80%',
            boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.12)',
            backgroundColor: theme.palette.warning.main,
            color: theme.palette.warning.contrastText,
          }}
        >
          {warning}
        </Alert>
      </Snackbar>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 22 }}
      >
        <Alert
          onClose={handleCloseError}
          severity="error"
          variant="filled"
          sx={{
            width: '80%',
            boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.12)',
          }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ExternalServicesSettings;