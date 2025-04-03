import type { Record } from 'src/types/chat-message';
import type { CustomCitation, Metadata } from 'src/types/chat-bot';

import React from 'react';
import { Icon } from '@iconify/react';

import { Box, Fade, Card, Chip, Stack, Button, Divider, Typography } from '@mui/material';

import axios from 'src/utils/axios';

import { CONFIG } from 'src/config-global';

import { ORIGIN } from 'src/sections/knowledgebase/constants/knowledge-search';

interface CitationHoverCardProps {
  citation: CustomCitation;
  isVisible: boolean;
  onRecordClick: (record: Record) => void;
  onClose: () => void;
  onViewPdf: (
    url: string,
    citationMeta: Metadata,
    citations: CustomCitation[],
    isExcelFile?: boolean,
    buffer?: ArrayBuffer
  ) => Promise<void>;
  aggregatedCitations: CustomCitation[];
}

interface TrimmedTextProps {
  text: string | undefined;
  maxLength?: number;
}

const TrimmedText = ({ text, maxLength = 150 }: TrimmedTextProps) => {
  if (!text) return null;
  const trimmedText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

  return (
    <Typography
      sx={{
        fontSize: '0.8rem',
        lineHeight: 1.4,
        color: 'text.secondary',
      }}
    >
      {trimmedText}
    </Typography>
  );
};

const CitationHoverCard = ({
  citation,
  isVisible,
  onRecordClick,
  onClose,
  onViewPdf,
  aggregatedCitations,
}: CitationHoverCardProps) => {
  const hasRecordId = Boolean(citation?.metadata?.recordId);

  const handleClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (hasRecordId && citation.metadata?.recordId) {
      // Create a proper Record object with the required citations property
      const record: Record = {
        ...citation.metadata,
        recordId: citation.metadata.recordId,
        citations: aggregatedCitations.filter(
          (c) => c.metadata?.recordId === citation.metadata?.recordId
        ),
      };
      onRecordClick(record);
      onClose();
    }
  };

  const handleOpenPdf = async () => {
    if (citation?.metadata?.recordId) {
      try {
        const isExcelOrCSV = ['csv', 'xlsx', 'xls'].includes(citation.metadata?.extension);
        console.log(isExcelOrCSV);
        // const recordId = citation.metadata?.recordId;
        // const response = await axios.get(`/api/v1/knowledgebase/record/${recordId}`);
        // const { record } = response.data;
        // const { externalRecordId } = record;
        // const fileName = record.recordName;
        // const downloadResponse = await axios.get(`/api/v1/document/${externalRecordId}/download`);
        // const url = downloadResponse.data.signedUrl;
        // onViewPdf(url, aggregatedCitations, isExcelOrCSV);
        const citationMeta = citation.metadata;
        onViewPdf('', citationMeta, aggregatedCitations, isExcelOrCSV);
        // if (record.origin === ORIGIN.UPLOAD) {
        //   try {
        //     const downloadResponse = await axios.get(
        //       `/api/v1/document/${externalRecordId}/download`,
        //       { responseType: 'blob' }
        //     );

        //     // Read the blob response as text to check if it's JSON with signedUrl
        //     const reader = new FileReader();
        //     const textPromise = new Promise<string>((resolve) => {
        //       reader.onload = () => {
        //         resolve(reader.result?.toString() || '');
        //       };
        //     });

        //     reader.readAsText(downloadResponse.data);
        //     const text = await textPromise;

        //     let filename = fileName || `document-${externalRecordId}`;
        //     const contentDisposition = downloadResponse.headers['content-disposition'];
        //     if (contentDisposition) {
        //       const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
        //       if (filenameMatch && filenameMatch[1]) {
        //         filename = filenameMatch[1];
        //       }
        //     }

        //     try {
        //       // Try to parse as JSON to check for signedUrl property
        //       const jsonData = JSON.parse(text);
        //       if (jsonData && jsonData.signedUrl) {
        //         onViewPdf(jsonData.signedUrl, aggregatedCitations, isExcelOrCSV);
        //       }
        //     } catch (e) {
        //       // Case 2: Local storage - Return buffer
        //       const bufferReader = new FileReader();
        //       const arrayBufferPromise = new Promise<ArrayBuffer>((resolve) => {
        //         bufferReader.onload = () => {
        //           resolve(bufferReader.result as ArrayBuffer);
        //         };
        //         bufferReader.readAsArrayBuffer(downloadResponse.data);
        //       });

        //       const buffer = await arrayBufferPromise;
        //       onViewPdf('', aggregatedCitations, isExcelOrCSV, buffer);
        //     }
        //   } catch (error) {
        //     console.error('Error downloading document:', error);
        //     throw new Error('Failed to download document');
        //   }
        // } else if (record.origin === ORIGIN.CONNECTOR) {
        //   try {
        //     const connectorResponse = await axios.get(
        //       `${CONFIG.backendUrl}/api/v1/knowledgeBase/stream/record/${recordId}`,
        //       {
        //         responseType: 'blob',
        //       }
        //     );

        //     // Extract filename from content-disposition header
        //     let filename = record.recordName || `document-${recordId}`;
        //     const contentDisposition = connectorResponse.headers['content-disposition'];
        //     if (contentDisposition) {
        //       const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
        //       if (filenameMatch && filenameMatch[1]) {
        //         filename = filenameMatch[1];
        //       }
        //     }

        //     // Convert blob directly to ArrayBuffer
        //     const bufferReader = new FileReader();
        //     const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        //       bufferReader.onload = () => {
        //         // Create a copy of the buffer to prevent detachment issues
        //         const originalBuffer = bufferReader.result as ArrayBuffer;
        //         const bufferCopy = originalBuffer.slice(0);
        //         resolve(bufferCopy);
        //       };
        //       bufferReader.onerror = () => {
        //         reject(new Error('Failed to read blob as array buffer'));
        //       };
        //       bufferReader.readAsArrayBuffer(connectorResponse.data);
        //     });

        //     const buffer = await arrayBufferPromise;
        //     onViewPdf('', aggregatedCitations, isExcelOrCSV, buffer);
        //   } catch (err) {
        //     console.error('Error downloading document:', err);
        //     throw new Error(`Failed to download document: ${err.message}`);
        //   }
        // }
      } catch (err) {
        console.error('Failed to fetch document:', err);
      }
    }
  };

  return (
    <Fade in={isVisible}>
      <Card
        sx={{
          position: 'absolute',
          zIndex: 1400,
          width: '380px',
          maxHeight: '320px',
          p: 1.5,
          mt: 1,
          boxShadow: '0 2px 14px rgba(0, 0, 0, 0.08)',
          borderRadius: '6px',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          overflow: 'auto',
        }}
      >
        <Stack spacing={1.5}>
          {/* Document Header with View Button */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 0.5,
            }}
          >
            <Typography
              variant="subtitle2"
              onClick={handleClick}
              sx={{
                cursor: hasRecordId ? 'pointer' : 'default',
                color: 'text.primary',
                fontWeight: 500,
                fontSize: '0.85rem',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                transition: 'color 0.2s ease-in-out',
                maxWidth: 'calc(100% - 80px)', // Reserve space for button
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': hasRecordId
                  ? {
                      color: 'primary.main',
                    }
                  : {},
              }}
            >
              <Icon
                icon="mdi:file-document-outline"
                width={16}
                height={16}
                style={{ flexShrink: 0 }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {citation.metadata?.recordName || 'Document'}
              </span>
            </Typography>

            <Button
              size="small"
              variant="outlined"
              color="primary"
              onClick={handleOpenPdf}
              sx={{
                py: 0.5,
                px: 1,
                minWidth: '64px', // Fixed minimum width for button
                height: '28px',
                borderRadius: '4px',
                textTransform: 'none',
                fontSize: '0.75rem',
                fontWeight: 500,
                ml: 1, // Add margin to separate from text
                flexShrink: 0, // Prevent button from shrinking
              }}
            >
              <Icon
                icon="mdi:eye-outline"
                width={14}
                height={14}
                style={{ marginRight: '4px', flexShrink: 0 }}
              />
              View
            </Button>
          </Box>
          {/* Document Metadata */}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
            <Chip
              size="small"
              label={`Page ${citation.metadata?.pageNum || 1}`}
              variant="outlined"
              sx={{
                height: '20px',
                fontSize: '0.7rem',
                fontWeight: 400,
                bgcolor: 'transparent',
              }}
            />
            {citation.metadata?.extension && (
              <Chip
                size="small"
                label={citation.metadata.extension.toUpperCase()}
                variant="outlined"
                sx={{
                  height: '20px',
                  fontSize: '0.7rem',
                  fontWeight: 400,
                  bgcolor: 'transparent',
                }}
              />
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          {/* Citation Content */}
          <Box>
            <Typography
              sx={{
                fontSize: '0.8rem',
                lineHeight: 1.5,
                color: 'text.primary',
                fontStyle: 'italic',
                mb: 0.5,
                pb: 0.5,
                borderLeft: '2px solid',
                borderColor: 'primary.light',
                pl: 1.5,
              }}
            >
              {citation?.content || 'No content available.'}
            </Typography>
          </Box>

          {/* Topics and Departments in one row */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Topics */}
            {citation.metadata?.topics && citation.metadata.topics.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 500, display: 'block', mb: 0.5, fontSize: '0.7rem' }}
                >
                  Topics
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {citation.metadata.topics.slice(0, 4).map((topic, index) => (
                    <Chip
                      key={index}
                      label={topic}
                      size="small"
                      sx={{
                        height: '18px',
                        fontSize: '0.65rem',
                        fontWeight: 400,
                        bgcolor: 'background.default',
                        color: 'text.secondary',
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  ))}
                  {citation.metadata.topics.length > 4 && (
                    <Chip
                      label={`+${citation.metadata.topics.length - 4}`}
                      size="small"
                      sx={{
                        height: '18px',
                        fontSize: '0.65rem',
                        fontWeight: 400,
                        bgcolor: 'background.default',
                        color: 'text.secondary',
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  )}
                </Box>
              </Box>
            )}

            {/* Departments */}
            {citation.metadata?.departments && citation.metadata.departments.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 500, display: 'block', mb: 0.5, fontSize: '0.7rem' }}
                >
                  Departments
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {citation.metadata.departments.map((dept, index) => (
                    <Chip
                      key={index}
                      label={dept}
                      size="small"
                      sx={{
                        height: '18px',
                        fontSize: '0.65rem',
                        fontWeight: 400,
                        bgcolor: 'background.default',
                        color: 'text.secondary',
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Stack>
      </Card>
    </Fade>
  );
};

export default CitationHoverCard;
