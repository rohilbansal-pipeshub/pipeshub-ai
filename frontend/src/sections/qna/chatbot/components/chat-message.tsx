import type { CustomCitation, Metadata } from 'src/types/chat-bot';
import type {
  Record,
  ChatMessageProps,
  MessageContentProps,
  StyledCitationProps,
} from 'src/types/chat-message';

import { Icon } from '@iconify/react';
import React, { useRef, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Chip,
  Fade,
  Paper,
  Stack,
  Dialog,
  Button,
  Tooltip,
  Divider,
  Collapse,
  Typography,
  IconButton,
  DialogTitle,
  DialogContent,
  CircularProgress,
} from '@mui/material';

import RecordDetails from './record-details';
import MessageFeedback from './message-feedback';
import CitationHoverCard from './citations-hover-card';
import scrollableContainerStyle from '../../utils/styles/scrollbar';

const formatTime = (createdAt: Date) => {
  const date = new Date(createdAt);
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const formatDate = (createdAt: Date) => {
  const date = new Date(createdAt);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const StyledCitation: React.FC<StyledCitationProps> = ({
  children,
  onMouseEnter,
  onMouseLeave,
}) => (
  <Box
    component="span"
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      ml: 0.5,
      cursor: 'pointer',
      position: 'relative',
      '&:hover .citation-number': {
        bgcolor: 'primary.main',
        color: 'white',
      },
    }}
  >
    <Box
      component="span"
      className="citation-number"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        bgcolor: 'grey.100',
        color: 'text.secondary',
        fontSize: '0.65rem',
        fontWeight: 600,
        transition: 'all 0.2s ease-in-out',
        textDecoration: 'none',
      }}
    >
      {children}
    </Box>
  </Box>
);

const MessageContent: React.FC<MessageContentProps> = ({
  content,
  citations,
  onRecordClick,
  aggregatedCitations,
  onViewPdf,
}) => {
  // We track the hovered citation by a unique identifier: "lineIndex-partIndex"
  const [hoveredCitationId, setHoveredCitationId] = useState<string | null>(null);
  const [hoveredRecordCitations, setHoveredRecordCitations] = useState<CustomCitation[]>([]);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create a mapping from citation number to the actual citation object
  const citationNumberMap = useMemo(() => {
    const result: { [key: number]: CustomCitation } = {};

    citations.forEach((citation) => {
      if (citation && citation.chunkIndex && !result[citation.chunkIndex]) {
        result[citation.chunkIndex] = citation;
      }
    });

    return result;
  }, [citations]);

  // Split content by newlines first
  const lines = useMemo(() => content.split('\n'), [content]);

  const handleMouseEnter = (citationRef: string, citationId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const citationNumber = parseInt(citationRef.replace(/[[\]]/g, ''), 10);
    const citation = citationNumberMap[citationNumber];

    if (citation) {
      if (citation.metadata?.recordId) {
        const recordCitations = aggregatedCitations[citation.metadata.recordId] || [];
        setHoveredRecordCitations(recordCitations);
      }
      setHoveredCitationId(citationId);
    }
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCitationId(null);
      setHoveredRecordCitations([]);
    }, 300); // Increased from 100ms to 300ms for smoother hover
  };

  const handleHoverCardMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleCloseHoverCard = () => {
    setHoveredCitationId(null);
    setHoveredRecordCitations([]);
  };

  // Render line with markdown and citations
  const renderLineWithMarkdown = (line: string, lineIndex: number) => {
    // Split the line by citation pattern
    const parts = line.split(/(\[\d+\])/);

    return (
      <Box
        key={lineIndex}
        sx={{
          mb: lineIndex < lines.length - 1 ? 2 : 0,
          opacity: 1,
          animation: lineIndex > 0 ? 'fadeIn 0.3s ease-in-out' : 'none',
          '@keyframes fadeIn': {
            from: { opacity: 0.7 },
            to: { opacity: 1 },
          },
        }}
      >
        {parts.map((part, partIndex) => {
          // Check if this part is a citation
          const citationMatch = part.match(/\[(\d+)\]/);
          if (citationMatch) {
            const citationNumber = parseInt(citationMatch[1], 10);
            const citation = citationNumberMap[citationNumber];
            const citationId = `${lineIndex}-${partIndex}`;

            return (
              <Tooltip
                key={citationId}
                title="View source details"
                placement="top"
                arrow
                enterDelay={500}
                componentsProps={{
                  tooltip: {
                    sx: {
                      bgcolor: 'background.paper',
                      color: 'text.primary',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      p: 1,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      border: '1px solid',
                      borderColor: 'divider',
                    },
                  },
                  arrow: {
                    sx: {
                      color: 'background.paper',
                    },
                  },
                }}
              >
                <Box
                  component="span"
                  onMouseEnter={() => handleMouseEnter(part, citationId)}
                  onMouseLeave={handleMouseLeave}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    ml: 0.5,
                    mr: 0.25,
                    cursor: 'pointer',
                    position: 'relative',
                    '&:hover': {
                      '& .citation-number': {
                        transform: 'scale(1.15) translateY(-1px)',
                        bgcolor: 'primary.main',
                        color: 'white',
                        boxShadow: '0 3px 8px rgba(25, 118, 210, 0.3)',
                      },
                    },
                    // Add invisible hit area for smoother hover
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      bottom: -8,
                      left: -8,
                      zIndex: -1,
                    },
                  }}
                >
                  <Box
                    component="span"
                    className="citation-number"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      bgcolor: 'rgba(25, 118, 210, 0.08)',
                      color: 'primary.main',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      border: '1px solid',
                      borderColor: 'rgba(25, 118, 210, 0.12)',
                    }}
                  >
                    {citationNumber}
                  </Box>
                  {hoveredCitationId === citationId && citation && (
                    <Fade in timeout={150}>
                      <Box
                        sx={{
                          position: 'absolute',
                          left: 0,
                          bottom: '100%',
                          zIndex: 1400,
                          mb: 1,
                          maxWidth: '350px',
                          width: 'max-content',
                          opacity: 1,
                        }}
                        onMouseEnter={handleHoverCardMouseEnter}
                        onMouseLeave={handleMouseLeave}
                      >
                        <CitationHoverCard
                          citation={citation}
                          isVisible={Boolean(true)}
                          onRecordClick={onRecordClick}
                          onClose={handleCloseHoverCard}
                          aggregatedCitations={hoveredRecordCitations}
                          onViewPdf={onViewPdf}
                        />
                      </Box>
                    </Fade>
                  )}
                </Box>
              </Tooltip>
            );
          }

          // For regular text parts, render with markdown
          return (
            <Box
              component="span"
              key={`${lineIndex}-${partIndex}`}
              sx={{
                display: 'inline',
                '& img': {
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '8px',
                  my: 2,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                },
                '& ul, & ol': {
                  pl: 2.5,
                  mb: 2,
                  mt: 1,
                },
                '& li': {
                  mb: 0.75,
                },
                // To prevent ReactMarkdown from creating unwanted paragraph elements
                '& > div > p': {
                  display: 'inline',
                  margin: 0,
                },
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Override paragraph to render as inline span for text segments
                  p: ({ node, ...props }) => <span {...props} />,
                }}
              >
                {part}
              </ReactMarkdown>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography
        component="div"
        sx={{
          fontSize: '0.90rem',
          lineHeight: 1.5,
          letterSpacing: '0.01em',
          wordBreak: 'break-word',
          color: 'text.primary',
          fontWeight: 400,
          '& code': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            padding: '0.2em 0.4em',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          },
          '& pre': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            padding: 1.5,
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.85em',
            overflow: 'auto',
            my: 1.5,
            '& code': {
              backgroundColor: 'transparent',
              padding: 0,
            },
          },
          '& strong': {
            fontWeight: 600,
            color: 'text.primary',
          },
          '& a': {
            color: 'primary.main',
            textDecoration: 'none',
            borderBottom: '1px dotted',
            borderColor: 'primary.light',
            transition: 'all 0.2s ease',
            '&:hover': {
              color: 'primary.dark',
              borderColor: 'primary.main',
            },
          },
          '& h1': {
            fontSize: '1.4rem',
            fontWeight: 600,
            marginTop: 2,
            marginBottom: 1.5,
          },
          '& h2': {
            fontSize: '1.2rem',
            fontWeight: 600,
            marginTop: 2,
            marginBottom: 1.5,
          },
          '& h3': {
            fontSize: '1.1rem',
            fontWeight: 600,
            marginTop: 2,
            marginBottom: 1,
          },
          '& h4, & h5, & h6': {
            fontSize: '1rem',
            fontWeight: 600,
            marginTop: 1.5,
            marginBottom: 1,
          },
          '& ul, & ol': {
            paddingLeft: 2.5,
            marginBottom: 1.5,
            marginTop: 0.5,
          },
          '& li': {
            marginBottom: 0.75,
          },
          '& blockquote': {
            borderLeft: '4px solid',
            borderColor: 'divider',
            paddingLeft: 2,
            margin: '1em 0',
            color: 'text.secondary',
            fontStyle: 'italic',
          },
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
            marginBottom: 2,
          },
          '& th, & td': {
            border: '1px solid',
            borderColor: 'divider',
            padding: '8px 12px',
            textAlign: 'left',
          },
          '& th': {
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            fontWeight: 600,
          },
        }}
      >
        {lines.map((line, lineIndex) => renderLineWithMarkdown(line, lineIndex))}
      </Typography>
    </Box>
  );
};

const ChatMessage = ({
  message,
  isExpanded,
  onToggleCitations,
  index,
  onRegenerate,
  onFeedbackSubmit,
  conversationId,
  isRegenerating,
  showRegenerate,
  onViewPdf,
}: ChatMessageProps) => {
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  const [isRecordDialogOpen, setRecordDialogOpen] = useState<boolean>(false);

  const aggregatedCitations = useMemo(() => {
    if (!message.citations) return {};

    return message.citations.reduce<{ [key: string]: CustomCitation[] }>((acc, citation) => {
      const recordId = citation.metadata?.recordId;
      if (!recordId) return acc;

      if (!acc[recordId]) {
        acc[recordId] = [];
      }
      acc[recordId].push(citation);
      return acc;
    }, {});
  }, [message.citations]);

  const handleOpenRecordDetails = (record: Record) => {
    const recordCitations = aggregatedCitations[record.recordId] || [];

    setSelectedRecord({ ...record, citations: recordCitations });
    setRecordDialogOpen(true);
  };

  const handleCloseRecordDetails = () => {
    setRecordDialogOpen(false);
    setSelectedRecord(null);
  };

  const handleViewPdf = async (
    url: string,
    citationMeta: Metadata,
    citations: CustomCitation[],
    isExcelFile?: boolean,
    buffer?: ArrayBuffer
  ): Promise<void> =>
    new Promise<void>((resolve) => {
      onViewPdf(url, citationMeta, citations, isExcelFile, buffer);
      resolve();
    });

  return (
    <Box sx={{ mb: 3, width: '100%', position: 'relative' }}>
      {/* Message Metadata */}
      <Box
        sx={{
          mb: 1,
          display: 'flex',
          justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
          px: 1.5,
          opacity: isRegenerating ? 0.5 : 1,
          transition: 'opacity 0.2s ease-in-out',
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
          }}
        >
          <Icon
            icon={message.type === 'user' ? 'mdi:account-circle' : 'mdi:robot-outline'}
            width={14}
            height={14}
            color={message.type === 'user' ? '#1976d2' : '#2e7d32'}
          />
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '0.65rem',
              fontWeight: 500,
            }}
          >
            {formatDate(message.createdAt)} • {formatTime(message.createdAt)}
          </Typography>
          {message.type === 'bot' && message.confidence && (
            <Chip
              label={message.confidence}
              size="small"
              sx={{
                height: '20px',
                fontSize: '0.60rem',
                fontWeight: 600,
                backgroundColor:
                  message.confidence === 'Very High'
                    ? 'rgba(46, 125, 50, 0.08)'
                    : 'rgba(237, 108, 2, 0.08)',
                color: message.confidence === 'Very High' ? '#2e7d32' : '#ed6c02',
              }}
            />
          )}
        </Stack>
      </Box>

      {/* Message Content */}
      <Box sx={{ position: 'relative' }}>
        <Paper
          elevation={1}
          sx={{
            width: '100%',
            maxWidth: '80%',
            p: 2,
            ml: message.type === 'user' ? 'auto' : 0,
            bgcolor: message.type === 'user' ? 'rgba(25, 118, 210, 0.02)' : 'background.paper',
            color: 'text.primary',
            borderRadius: '12px',
            border: '1.5px solid',
            borderColor:
              message.type === 'user' ? 'rgba(25, 118, 210, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            position: 'relative',
            transition: 'all 0.2s ease-in-out',
            opacity: isRegenerating ? 0.5 : 1,
            filter: isRegenerating ? 'blur(0.5px)' : 'none',
            '&:hover': {
              borderColor:
                message.type === 'user' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            },
          }}
        >
          {/* Message Content with Citation Hover */}
          {message.type === 'bot' ? (
            <MessageContent
              content={message.content}
              citations={message.citations || []}
              onRecordClick={handleOpenRecordDetails}
              aggregatedCitations={aggregatedCitations}
              onViewPdf={handleViewPdf}
            />
          ) : (
            <Box
              sx={{
                fontSize: '0.9rem',
                lineHeight: 1.6,
                letterSpacing: '0.005em',
                wordBreak: 'break-word',
                '& p': { mt: 0, mb: 1.5 },
                '& h1': { fontSize: '1.4rem', fontWeight: 600, my: 1.5 },
                '& h2': { fontSize: '1.2rem', fontWeight: 600, my: 1.5 },
                '& h3': { fontSize: '1.1rem', fontWeight: 600, my: 1.5 },
                '& h4': { fontSize: '1rem', fontWeight: 600, my: 1.5 },
                '& h5, & h6': { fontSize: '0.9rem', fontWeight: 600, my: 1.5 },
                '& ul, & ol': { pl: 2.5, mb: 1.5, mt: 0 },
                '& li': { mb: 0.75 },
                '& blockquote': {
                  pl: 1.5,
                  ml: 0,
                  borderLeft: '4px solid',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  fontStyle: 'italic',
                  my: 1.5,
                },
                '& code': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: '0.2em 0.4em',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.85em',
                },
                '& pre': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: 2,
                  borderRadius: '4px',
                  overflow: 'auto',
                  my: 1.5,
                  '& code': {
                    backgroundColor: 'transparent',
                    padding: 0,
                    borderRadius: 0,
                    fontFamily: 'monospace',
                    fontSize: '0.85em',
                  },
                },
                '& a': {
                  color: 'primary.main',
                  textDecoration: 'none',
                  borderBottom: '1px dotted',
                  borderColor: 'primary.light',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    color: 'primary.dark',
                    borderColor: 'primary.main',
                  },
                },
                '& img': {
                  maxWidth: '100%',
                  borderRadius: 1,
                },
                '& table': {
                  borderCollapse: 'collapse',
                  width: '100%',
                  mb: 1.5,
                },
                '& th, & td': {
                  border: '1px solid',
                  borderColor: 'divider',
                  padding: '8px 12px',
                  textAlign: 'left',
                },
                '& th': {
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  fontWeight: 600,
                },
              }}
            >
              <ReactMarkdown
              // If you've added remark-gfm:
              // remarkPlugins={[remarkGfm]}
              >
                {message.content}
              </ReactMarkdown>
            </Box>
          )}
          {/* Citations Section */}
          {message.citations && message.citations?.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Tooltip title={isExpanded ? 'Hide Citations' : 'Show Citations'}>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => onToggleCitations(index)}
                  startIcon={
                    <Icon
                      icon={isExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                      width={16}
                      height={16}
                    />
                  }
                  sx={{
                    color: 'primary.main',
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '0.7rem',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.05)',
                    },
                  }}
                >
                  {message.citations.length} {message.citations.length === 1 ? 'Source' : 'Sources'}
                </Button>
              </Tooltip>

              <Collapse in={isExpanded}>
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {message.citations.map((citation, cidx) => (
                    <Paper
                      key={cidx}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        bgcolor: 'rgba(0, 0, 0, 0.02)',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: 'rgba(0, 0, 0, 0.04)',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.03)',
                          borderColor: 'rgba(0, 0, 0, 0.07)',
                          transform: 'translateY(-1px)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                        },
                      }}
                    >
                      <Stack spacing={1.25}>
                        <Typography
                          sx={{
                            fontSize: '0.8rem',
                            lineHeight: 1.6,
                            color: 'text.secondary',
                            fontWeight: 500,
                            fontStyle: 'italic',
                            position: 'relative',
                            pl: 1.5,
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: '3px',
                              bgcolor: 'primary.light',
                              borderRadius: '4px',
                            },
                          }}
                        >
                          {citation.content}
                        </Typography>

                        {citation.metadata?.recordId && (
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="text"
                              startIcon={
                                <Icon icon="mdi:file-document-outline" width={12} height={12} />
                              }
                              onClick={() => {
                                if (citation.metadata?.recordId) {
                                  const record: Record = {
                                    // recordId: citation.metadata.recordId,
                                    citations: [], // This will be populated by handleOpenRecordDetails
                                    ...citation.metadata,
                                  };
                                  handleOpenRecordDetails(record);
                                }
                              }}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: 'primary.main',
                                p: 0.75,
                                minWidth: 0,
                                borderRadius: '20px',
                                '&:hover': {
                                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                },
                              }}
                            >
                              View Details
                            </Button>
                          </Box>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Collapse>
            </Box>
          )}
          {/* Message Controls */}
          {message.type === 'bot' && (
            <>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" spacing={1} alignItems="center">
                {showRegenerate && (
                  <Tooltip title="Regenerate response">
                    <IconButton
                      onClick={() => onRegenerate(message.id)}
                      size="small"
                      disabled={isRegenerating}
                      sx={{
                        color: 'text.secondary',
                        '&:hover': {
                          color: 'primary.main',
                          backgroundColor: 'rgba(25, 118, 210, 0.05)',
                        },
                      }}
                    >
                      <Icon
                        icon={isRegenerating ? 'mdi:loading' : 'mdi:refresh'}
                        width={16}
                        height={16}
                        className={isRegenerating ? 'spin' : ''}
                      />
                    </IconButton>
                  </Tooltip>
                )}
                <MessageFeedback
                  messageId={message.id}
                  conversationId={conversationId}
                  onFeedbackSubmit={onFeedbackSubmit}
                />
              </Stack>
            </>
          )}
        </Paper>
      </Box>

      {/* Record Details Dialog */}
      <Dialog
        open={isRecordDialogOpen}
        onClose={handleCloseRecordDetails}
        maxWidth="md"
        fullWidth
        PaperProps={{
          elevation: 1,
          sx: {
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: '1rem',
            fontWeight: 500,
            py: 2,
            px: 2.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          Record Details
        </DialogTitle>
        <DialogContent sx={{ p: 2.5, ...scrollableContainerStyle }}>
          {selectedRecord && (
            <RecordDetails
              recordId={selectedRecord.recordId}
              citations={selectedRecord.citations}
            />
          )}
        </DialogContent>
      </Dialog>
      {isRegenerating && (
        <Fade in>
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: message.type === 'user' ? 'auto' : '50%',
              right: message.type === 'user' ? '50%' : 'auto',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={24} />
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
                bgcolor: 'background.paper',
                px: 2,
                py: 0.5,
                borderRadius: 1,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.03)',
              }}
            >
              Regenerating...
            </Typography>
          </Box>
        </Fade>
      )}
    </Box>
  );
};

export default ChatMessage;
