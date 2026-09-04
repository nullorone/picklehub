import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

export function useValidatedForm<TInput extends FieldValues, TOutput extends FieldValues>(
    schema: ZodType<TOutput, TInput>,
    options?: Omit<UseFormProps<TInput, unknown, TOutput>, 'resolver'>
): UseFormReturn<TInput, unknown, TOutput> {
    return useForm<TInput, unknown, TOutput>({ ...options, resolver: zodResolver(schema) });
}
