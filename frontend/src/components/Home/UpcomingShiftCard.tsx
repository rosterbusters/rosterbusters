import { useEffect, useState } from 'react';
import { Box, Text, Spinner, Alert } from '@chakra-ui/react';

interface UpcomingShift {
  has_shift: boolean;
  nurse_name: string;
  shift_type?: string;
  shift_time?: string;
  shift_date?: string;
  shift_day?: string;
  formatted_date?: string;
  shift_code?: string;
  ward_name?: string;
}

export const UpcomingShiftCard = () => {
  const [shift, setShift] = useState<UpcomingShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUpcomingShift();
  }, []);

  const fetchUpcomingShift = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/home/upcoming-shift', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch upcoming shift');
      
      const data = await response.json();
      setShift(data);
    } catch (err: any) {
      console.error('Error fetching upcoming shift:', err);
      setError(err.message || 'Failed to load upcoming shift');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box bg="white" borderRadius="lg" p={8} shadow="sm" display="flex" justifyContent="center" alignItems="center">
        <Spinner size="lg" color="blue.500" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box bg="white" borderRadius="lg" p={8} shadow="sm">
        <Alert.Root status="error" borderRadius="md">
          <Alert.Indicator/>
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert.Root>
      </Box>
    );
  }

  if (!shift) return null;

  return (
    <Box bg="white" borderRadius="lg" p={8} shadow="sm">
      <Text fontSize="2xl" fontWeight="medium" color="gray.700" mb={4}>
        Hi <Text as="span" color="blue.600">{shift.nurse_name}</Text>,
      </Text>
      {shift.has_shift ? (
        <Text fontSize="lg" color="gray.600" lineHeight="tall">
          You have an upcoming{' '}
          <Text as="span" color="blue.600" fontWeight="semibold">
            {shift.shift_type || 'Shift'}
          </Text>
          {shift.shift_time && (
            <>
              {' '}at{' '}
              <Text as="span" color="blue.600" fontWeight="semibold">
                {shift.shift_time}
              </Text>
            </>
          )}
          , on{' '}
          <Text as="span" color="blue.600" fontWeight="semibold">
            {shift.shift_day}, {shift.formatted_date}
          </Text>
          .
        </Text>
      ) : (
        <Text fontSize="lg" color="gray.600">
          You have no upcoming shifts scheduled at the moment.
        </Text>
      )}
    </Box>
  );
};
