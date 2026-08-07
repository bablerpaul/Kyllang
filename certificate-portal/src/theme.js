import { alpha, createTheme } from '@mui/material/styles';

const swissTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#F8F6F2',
      paper: '#FFFFFF',
    },
    primary: {
      main: '#0B1F3A',
      dark: '#08172D',
      light: '#1B365D',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#C8A96B',
      dark: '#A98847',
      light: '#D8BD8A',
      contrastText: '#0B1F3A',
    },
    success: {
      main: '#10B981',
      dark: '#059669',
      light: '#34D399',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#F59E0B',
      dark: '#D97706',
      light: '#FBBF24',
      contrastText: '#0B1F3A',
    },
    error: {
      main: '#DC2626',
      dark: '#B91C1C',
      light: '#EF4444',
      contrastText: '#FFFFFF',
    },
    text: {
      primary: '#0B1F3A',
      secondary: '#44556F',
    },
    divider: '#DFE5EC',
  },
  typography: {
    fontFamily: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'].join(','),
    h1: {
      fontFamily: ['Playfair Display', 'Garamond', 'Georgia', 'serif'].join(','),
      fontSize: 'clamp(2.5rem, 2.1rem + 1.2vw, 3rem)',
      lineHeight: 1.12,
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: ['Playfair Display', 'Garamond', 'Georgia', 'serif'].join(','),
      fontSize: 'clamp(1.75rem, 1.6rem + 0.6vw, 2rem)',
      lineHeight: 1.2,
      fontWeight: 600,
      letterSpacing: '-0.015em',
    },
    h3: {
      fontFamily: ['Playfair Display', 'Garamond', 'Georgia', 'serif'].join(','),
      fontSize: '1.5rem',
      lineHeight: 1.25,
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontSize: '1.125rem',
      lineHeight: 1.3,
      fontWeight: 600,
    },
    h5: {
      fontSize: '1rem',
      lineHeight: 1.35,
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      lineHeight: 1.35,
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
    },
    button: {
      fontSize: '1rem',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
      letterSpacing: '0.04em',
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 10,
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: '100%',
          scrollBehavior: 'smooth',
        },
        body: {
          minHeight: '100%',
          backgroundColor: '#F8F6F2',
          color: '#0B1F3A',
        },
        a: {
          color: 'inherit',
          textDecoration: 'none',
        },
        '*::selection': {
          backgroundColor: alpha('#C8A96B', 0.3),
          color: '#0B1F3A',
        },
        '*': {
          boxSizing: 'border-box',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#0B1F3A',
          borderBottom: '1px solid #DFE5EC',
          boxShadow: '0 2px 8px rgba(11, 31, 58, 0.06)',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        regular: {
          minHeight: 64,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #DFE5EC',
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid #DFE5EC',
          borderRadius: 10,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #DFE5EC',
          borderRadius: 10,
          boxShadow: '0 6px 18px rgba(11, 31, 58, 0.06)',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 24,
          '&:last-child': {
            paddingBottom: 24,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 8,
          textTransform: 'none',
          boxShadow: 'none',
          paddingInline: 16,
          transition: 'background-color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
          '&:hover': {
            boxShadow: '0 6px 18px rgba(11, 31, 58, 0.16)',
            transform: 'translateY(-1px)',
          },
        },
        containedPrimary: {
          backgroundColor: '#0B1F3A',
          '&:hover': {
            backgroundColor: '#08172D',
          },
        },
        containedSecondary: {
          backgroundColor: '#C8A96B',
          color: '#0B1F3A',
          '&:hover': {
            backgroundColor: '#A98847',
          },
        },
        outlinedPrimary: {
          borderColor: '#C4CFDD',
          color: '#0B1F3A',
          backgroundColor: '#FFFFFF',
          '&:hover': {
            borderColor: '#0B1F3A',
            backgroundColor: alpha('#0B1F3A', 0.04),
          },
        },
        text: {
          borderRadius: 8,
        },
        sizeSmall: {
          minHeight: 36,
        },
        sizeLarge: {
          minHeight: 48,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#C4CFDD',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#7E91AB',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#0B1F3A',
            borderWidth: 1.5,
          },
        },
        input: {
          minHeight: 22,
          padding: '14px 14px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#44556F',
          fontWeight: 500,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: '#0B1F3A',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: '1rem',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #DFE5EC',
          padding: '16px 18px',
        },
        head: {
          fontWeight: 600,
          color: '#0B1F3A',
          backgroundColor: '#F8F6F2',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8F6F2',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': {
            borderBottom: 0,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          marginInline: 8,
          marginBlock: 2,
          minHeight: 44,
          color: '#0B1F3A',
          '&:hover': {
            backgroundColor: alpha('#0B1F3A', 0.05),
          },
          '&.Mui-selected': {
            backgroundColor: alpha('#C8A96B', 0.18),
            color: '#0B1F3A',
            '&:hover': {
              backgroundColor: alpha('#C8A96B', 0.26),
            },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 40,
          color: '#44556F',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#DFE5EC',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 48,
        },
        indicator: {
          height: 3,
          borderRadius: 999,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 48,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          paddingInline: 16,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: '1px solid transparent',
        },
        standardInfo: {
          borderColor: alpha('#0B1F3A', 0.2),
        },
        standardSuccess: {
          borderColor: alpha('#10B981', 0.2),
        },
        standardWarning: {
          borderColor: alpha('#F59E0B', 0.2),
        },
        standardError: {
          borderColor: alpha('#DC2626', 0.2),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
        sizeSmall: {
          height: 28,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 8,
          paddingInline: 18,
          textTransform: 'none',
          borderColor: '#C4CFDD',
          '&.Mui-selected': {
            backgroundColor: alpha('#C8A96B', 0.2),
            color: '#0B1F3A',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: '1px solid #DFE5EC',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          overflow: 'hidden',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
  },
});

export default swissTheme;