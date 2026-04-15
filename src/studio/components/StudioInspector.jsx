import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    FormControl,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { cloneValue } from '../../shared/projectSchema.js'

const setNestedValue = (value, path, nextValue) => {
    const draft = cloneValue(value)
    let cursor = draft
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index]
        cursor[key] = cloneValue(cursor[key])
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = nextValue
    return draft
}

const readNestedValue = (value, path = []) => path.reduce((current, key) => current?.[key], value)

function StudioField({ field, value, assetOptions = [], onChange }) {
    if (field.type === 'checkbox') {
        return (
            <FormControlLabel
                control={(
                    <Switch
                        checked={Boolean(value)}
                        onChange={(event) => onChange(event.target.checked)}
                    />
                )}
                label={field.label}
            />
        )
    }

    if (field.type === 'select') {
        return (
            <FormControl fullWidth size="small">
                <InputLabel>{field.label}</InputLabel>
                <Select
                    label={field.label}
                    value={value || ''}
                    onChange={(event) => onChange(event.target.value)}
                >
                    {(field.options || []).map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
        )
    }

    if (field.type === 'asset') {
        return (
            <FormControl fullWidth size="small">
                <InputLabel>{field.label}</InputLabel>
                <Select
                    label={field.label}
                    value={value || ''}
                    onChange={(event) => onChange(event.target.value || null)}
                >
                    <MenuItem value="">Unassigned</MenuItem>
                    {assetOptions.map((asset) => (
                        <MenuItem key={asset.id} value={asset.id}>{asset.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
        )
    }

    if (field.type === 'textarea') {
        return (
            <TextField
                fullWidth
                multiline
                minRows={4}
                label={field.label}
                size="small"
                value={value || ''}
                onChange={(event) => onChange(event.target.value)}
            />
        )
    }

    if (field.type === 'color') {
        return (
            <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">{field.label}</Typography>
                <TextField
                    fullWidth
                    size="small"
                    type="color"
                    value={value || '#ffffff'}
                    onChange={(event) => onChange(event.target.value)}
                    inputProps={{ 'aria-label': field.label }}
                />
            </Stack>
        )
    }

    return (
        <TextField
            fullWidth
            size="small"
            label={field.label}
            type={field.type === 'number' ? 'number' : 'text'}
            value={field.type === 'number' && !Number.isFinite(Number(value)) ? 0 : (value ?? '')}
            inputProps={field.type === 'number'
                ? {
                    min: field.min,
                    max: field.max,
                    step: field.step ?? 0.1
                }
                : undefined}
            onChange={(event) => {
                if (field.type === 'number') {
                    onChange(Number(event.target.value))
                    return
                }
                onChange(event.target.value)
            }}
        />
    )
}

export default function StudioInspector({
    title,
    subtitle = '',
    sections = [],
    assetOptions = [],
    values = {},
    onSectionChange,
    footer = null,
    emptyMessage = 'Select an entity to edit it.'
}) {
    if (!sections.length) {
        return (
            <Box className="studio-empty-state">
                <Typography variant="subtitle2">{emptyMessage}</Typography>
            </Box>
        )
    }

    return (
        <Stack spacing={1.5}>
            <Box>
                <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
                {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
            </Box>
            {sections.map((section) => {
                const sectionValue = values[section.id] || values[section.component] || {}
                return (
                    <Accordion key={section.id} defaultExpanded disableGutters>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">{section.label}</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Grid container spacing={1.25}>
                                {section.fields.map((field) => (
                                    <Grid
                                        key={`${section.id}-${field.label}`}
                                        size={{ xs: 12 }}
                                    >
                                        <StudioField
                                            field={field}
                                            value={readNestedValue(sectionValue, field.path)}
                                            assetOptions={assetOptions}
                                            onChange={(nextValue) => {
                                                const nextSectionValue = setNestedValue(sectionValue, field.path, nextValue)
                                                onSectionChange?.(field.component || section.id, nextSectionValue)
                                            }}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        </AccordionDetails>
                    </Accordion>
                )
            })}
            {footer}
        </Stack>
    )
}
